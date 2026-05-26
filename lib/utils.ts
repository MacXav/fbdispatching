/**
 * Utility functions for the dispatch application
 */

/**
 * Format date to readable string
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format time to readable string
 */
export function formatTime(timeString: string): string {
  try {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const min = minutes;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${min} ${ampm}`;
  } catch {
    return timeString;
  }
}

/**
 * Format weight in kg to display string
 */
export function formatWeight(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(1)} t`;
  }
  return `${kg} kg`;
}

/**
 * Calculate percentage
 */
export function calculatePercentage(current: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((current / total) * 100);
}

/**
 * Get status color for styling
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'yellow',
    picked_up: 'blue',
    at_cross_dock: 'purple',
    out_for_delivery: 'orange',
    delivered: 'green',
    available: 'green',
    loaded: 'yellow',
    maintenance: 'red',
  };
  return colors[status] || 'gray';
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
}

/**
 * Format phone number to standard format
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if date is today
 */
export function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Get days until date
 */
export function daysUntil(dateString: string): number {
  const date = new Date(dateString);
  const today = new Date();
  const diff = date.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Check if date is overdue
 */
export function isOverdue(dateString: string): boolean {
  return daysUntil(dateString) < 0;
}

/**
 * Truncate text to max length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Convert address to URL-safe string for maps
 */
export function addressToMapUrl(address: string, city: string, postal: string): string {
  const fullAddress = `${address}, ${city}, ${postal}`.replace(/\s+/g, '+');
  return `https://www.google.com/maps/search/${fullAddress}`;
}
