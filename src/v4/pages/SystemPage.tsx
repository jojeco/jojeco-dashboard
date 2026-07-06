import { Cpu } from 'lucide-react';
import { PlaceholderPage } from './PlaceholderPage';

export default function SystemPage() {
  return (
    <PlaceholderPage
      title="System"
      icon={Cpu}
      message="AI fleet, Ollama nodes, and system logs coming in slice 2"
      action="Fleet status visible in the legacy Lab tab"
    />
  );
}
