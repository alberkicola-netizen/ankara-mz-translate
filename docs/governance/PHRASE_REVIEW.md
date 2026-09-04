# Phrase review procedure

## Purpose

Every bedside card is a **clinically reviewed** utterance, not a dictionary dump. Source of truth for vitals, pain, allergies, feeding, consent *requests*, and emergency calls.

## Sources for the first pack

1. Two shadowed shifts on the pilot unit (maternity or neonatology).  
2. Preceptor “top 50” list (what they actually say).  
3. Observer “I could not say” list after day 1.  

This repository’s pack is a **starter set** for that workshop. It must be re-signed before a live ward go-live.

## Reviewers

- **A:** Portuguese-competent clinician (Mozambican nurse or bilingual faculty).  
- **B:** Turkish nursing or obstetric/neonatal staff on the unit.  
- **C (spot-check):** English for protocol alignment only.

## Checklist per phrase

- Same meaning in PT, TR, EN (not word-for-word).  
- Register: polite “siz/você” for patients; short commands only for true emergencies.  
- No doses, drug names as *orders*, or diagnostic claims. Questions about allergies/medicines are allowed.  
- Emergency items: large type, unambiguous.  
- Unit-specific lines (nurse station, fasting rules) filled in by the ward, not left as placeholders.

## Versioning

- File: `src/data/phrases.ts` (and built JSON in the PWA cache).  
- Field `reviewStatus`: `starter` | `reviewed` | `frozen`.  
- After live review, set `reviewed` and `reviewedAt` (ISO date).  
- Frozen categories stay in the app but show a warning until replaced.

## Sign-off line (copy to paper)

Pack version: __________  Unit: __________  Date: __________  
Reviewer A (name/role): __________  
Reviewer B (name/role): __________  
Chair: __________
