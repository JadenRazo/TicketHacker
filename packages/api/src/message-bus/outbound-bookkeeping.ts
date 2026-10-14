import type { PrismaService } from '../prisma/prisma.service';

// Capture identity before the external send: a merge may move these messages
// while the channel is sending. Content matching after send loses that identity.
export async function captureOutboundMessages(prisma: PrismaService, tenantId: string, ticketId: string, content: string) {
  const rows = await prisma.message.findMany({ where: {
    tenantId, ticketId, contentText: content, direction: 'OUTBOUND', messageType: 'TEXT', externalId: null,
  }, select: { id: true } });
  return rows.map(row => row.id);
}

class ParentMoved extends Error {}

// Retry only this database acknowledgement, never the already completed send.
// All existing Message UPDATE writers use parent-before-message lock ordering.
export async function recordOutboundDelivery(prisma: PrismaService, tenantId: string, messageIds: string[], externalId: string) {
  if (!messageIds.length) throw new Error('No captured outbound message; acknowledgement needs reconciliation');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
        const where = { tenantId, id: { in: messageIds } };
        const observed = await tx.message.findMany({ where, select: { id: true, ticketId: true } });
        if (observed.length !== messageIds.length) throw new Error('Captured message identity no longer exists');
        const parents = [...new Set(observed.map(row => row.ticketId))];
        const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM public."Ticket"
          WHERE "tenantId" = ${tenantId} AND id = ANY(${parents}::text[]) ORDER BY id FOR UPDATE`;
        if (locked.length !== parents.length) throw new Error('Outbound parent tenant mismatch');
        const current = await tx.message.findMany({ where });
        if (current.length !== observed.length || current.some(row =>
          observed.find(old => old.id === row.id)?.ticketId !== row.ticketId)) throw new ParentMoved();
        if (current.some(row => row.direction !== 'OUTBOUND' || row.messageType !== 'TEXT' ||
          (row.externalId !== null && row.externalId !== externalId))) throw new Error('Outbound acknowledgement identity conflict');
        const pending = current.filter(row => row.externalId === null).map(row => row.id);
        if (!pending.length) return;
        const updated = await tx.message.updateMany({ where: { tenantId, id: { in: pending },
          ticketId: { in: parents }, direction: 'OUTBOUND', messageType: 'TEXT', externalId: null }, data: { externalId } });
        if (updated.count !== pending.length) throw new Error('Outbound acknowledgement was not fully recorded');
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt === 2 || (!(error instanceof ParentMoved) && !['P2034', '40001', '40P01'].includes(code ?? ''))) throw error;
    }
  }
}
