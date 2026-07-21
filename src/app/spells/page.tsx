import ReferenceLibrary from '@/components/ReferenceLibrary';

/** Legacy deep link: spells now live inside the unified Reference Library. */
export default function SpellsPage() {
  return <ReferenceLibrary initialCategory="spells" />;
}
