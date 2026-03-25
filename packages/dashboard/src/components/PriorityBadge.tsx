interface PriorityBadgeProps {
  priority: string;
}

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  NORMAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  URGENT: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  const colorClass = priorityColors[priority] || priorityColors.NORMAL;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
    >
      {priority}
    </span>
  );
}
