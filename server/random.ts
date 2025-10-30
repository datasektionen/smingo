const seedMod = 2 ** 35 - 31;
const multiplier = 185852;

export function createSeededRandom(seed: number) {
  let state = seed % seedMod;
  return function () {
    state = (state * multiplier) % seedMod;
    return state / seedMod;
  };
}
