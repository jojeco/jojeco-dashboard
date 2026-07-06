import { Sliders } from 'lucide-react';
import { PlaceholderPage } from './PlaceholderPage';

export default function ControlsPage() {
  return (
    <PlaceholderPage
      title="Controls"
      icon={Sliders}
      message="Server power, container controls, and automation triggers coming in slice 2"
      action="Use the legacy Controls tab for now"
    />
  );
}
