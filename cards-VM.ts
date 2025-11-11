import commonCards from "./cards.ts";

const vmExclusive = [
  `Et val är klart på under 5 minuter`,
  `En val tar mer än 30 minuter`,
  `"Hej VM!"`,
  `Kandidat presenterar i max 20 sekunder`,
  `VM börjar minst 15 min sent`,
  `"VMingo!"`,
  `VM tar mer än 3 timmar`,
  `Valkandidat dyker inte upp på VM`,
  `"Ni har ju alla läst valhandlingarna men ..."`,
  `Det saknas kandidater, vakantställning`,
];

export default [...commonCards, ...vmExclusive];
