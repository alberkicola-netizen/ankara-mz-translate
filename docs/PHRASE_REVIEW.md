# Phrase review process

Every bedside card is **source of truth** only after dual review.

## Workflow

1. **Shadow** two shifts on the pilot unit (obstetrics or neonatology). Note actual utterances, not textbook sentences.
2. **Draft** PT / TR / EN in the pack (`src/data/phrases.json` or Admin export).
3. **Nurse reviewer** (Mozambican representative): Portuguese sounds natural for Maputo / Matola staff.
4. **Clinician reviewer** (obstetrics or neonatology + Turkish nurse): Turkish is what staff and patients actually hear; English is for faculty / protocols.
5. Mark `risk`: `routine`, `sensitive` (allergies, bleeding, consent *request*), or `emergency`.
6. **Publish** a pack version (`packVersion` in JSON). Observers refresh on Wi-Fi.
7. **Retire** any phrase that caused confusion in the week-4 evaluation.

## What must stay out of the pack

- Drug **doses** and “take this medicine” as if prescribing.
- Legal consent wording (use hospital forms and a licensed interpreter / bilingual clinician).
- Ward-specific crash-cart locations until the pilot unit fills the placeholders (`emergency` items tagged `needsWardFill`).

## Sign-off table (print for the steering folder)

| Pack version | Date | Nurse PT | Clinician TR | Nursing directorate | Frozen categories |
| --- | --- | --- | --- | --- | --- |
| 1.0.0-pilot | | | | | none |
