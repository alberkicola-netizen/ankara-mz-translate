import { useParams } from "react-router-dom";
import { PHRASES } from "../data/phrases";
import { PhraseCard } from "../components/PhraseCard";

export function PhrasePage() {
  const { id } = useParams();
  const phrase = PHRASES.find((p) => p.id === id);
  if (!phrase) return <p>Not found</p>;
  return <PhraseCard phrase={phrase} />;
}
