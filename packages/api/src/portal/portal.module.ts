import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PortalAuthGuard } from './portal-auth.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule exports JwtModule (and JwtService) which the guard and service need
  imports: [AuthModule],
  controllers: [PortalController],
  providers: [PortalService, PortalAuthGuard],
})
export class PortalModule {}
