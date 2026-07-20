import PartyManager from '@/components/PartyManager';
import ToolPageHeader from '@/components/ToolPageHeader';

export default function PartyPage() {
  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <ToolPageHeader path="/party" />
      <PartyManager />
    </div>
  );
}
