import type { Scenario } from '@/lib/types';

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export async function nextCustomerMessage(
  scenario: Scenario,
  turn: number,
): Promise<string | null> {
  await wait(650);
  return scenario.messages[turn] ?? null;
}
