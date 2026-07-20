'use client';

import { Printer } from 'lucide-react';
import BattleOrganizer from '@/components/BattleOrganizer';
import ToolPageHeader from '@/components/ToolPageHeader';

export default function BattlePage() {
  return <div className="animate-fade-in">
    <ToolPageHeader
      path="/battle"
      description="Run initiative without losing the room: see who is acting, who is next, and who is on deck while tracking the details that usually fall through the cracks."
      actions={<button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}><Printer size={17} aria-hidden="true" /> Print battle</button>}
    />
    <BattleOrganizer />
  </div>;
}
