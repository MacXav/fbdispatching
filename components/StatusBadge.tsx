'use client';

import { ShipmentStatus, TruckStatus } from '@/types';

interface StatusBadgeProps {
  status: ShipmentStatus | TruckStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const statusMap: Record<string, { className: string; label: string }> = {
    pending: { className: 'badge-pending', label: 'Pending' },
    picked_up: { className: 'badge-picked-up', label: 'Picked Up' },
    at_cross_dock: { className: 'badge-at-cross-dock', label: 'At Cross Dock' },
    out_for_delivery: { className: 'badge-out-for-delivery', label: 'Out for Delivery' },
    delivered: { className: 'badge-delivered', label: 'Delivered' },
    available: { className: 'badge-available', label: 'Available' },
    loaded: { className: 'badge-loaded', label: 'Loaded' },
    maintenance: { className: 'badge-maintenance', label: 'Maintenance' },
  };

  const config = statusMap[status] || statusMap.pending;

  return <span className={config.className}>{config.label}</span>;
}
