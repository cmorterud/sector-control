// A central dirt column rises out of a deep trench; surrounding puffs stay at the burst.
export function blastPlume(age: number, index: number, power = 1) {
  const core = index < 3;
  const layer = 1 - index * 0.32;
  const angle = (index * Math.PI * 2) / 9;
  const spread = core
    ? index * 0.2 * power
    : (0.25 + age * (0.55 + (index % 3) * 0.15)) * power;
  const rise = core
    ? Math.min(4.8 * power, age * 4.5 * power) * layer
    : age * (0.7 + (index % 3) * 0.25);
  const size =
    (0.5 + Math.sqrt(age) * (core ? 2.3 : 1.2 + (index % 3) * 0.25)) * power;
  return {
    x: Math.sin(angle) * spread,
    y: rise,
    z: Math.cos(angle) * spread,
    size,
    height: size * (core ? 1.15 : 0.85),
  };
}
