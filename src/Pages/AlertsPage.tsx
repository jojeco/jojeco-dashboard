/**
 * AlertsPage — full-page alert feed.
 * Thin wrapper around AlertCenter's AlertsPage component so it can be
 * registered as a route in App.tsx.
 */
import { AlertsPage as AlertCenterPage } from '@/components/AlertCenter';

export default function AlertsPage() {
  return <AlertCenterPage />;
}
