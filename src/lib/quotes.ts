// Deterministic pick of one compact, high-energy quote per calendar day.
// Most lines are original HETU copy. The four character quotes are
// deliberately short, accurately attributed, and kept as a small accent.

export interface QuotePreset {
  text: string;
  attribution: string;
}

const original = (text: string): QuotePreset => ({
  text,
  attribution: 'HETU'
});

export const QUOTES: readonly QuotePreset[] = [
  original("Rank isn't given. It's taken - one clean session at a time."),
  original('Let them count hours. You collect marks.'),
  original("The paper doesn't know your fear. Keep it that way."),
  original("While they negotiate with comfort, you're building an unfair advantage."),
  original('Make the hard question regret showing up.'),
  original('Your competition has motivation. You have a system.'),
  original('Calm face. Violent focus. Clean execution.'),
  original("Don't chase confidence. Stack proof until doubt looks stupid."),
  original("Today's weak spot is tomorrow's free mark."),
  original("You don't need a perfect day. You need a finished plan."),
  original('The rank is already moving. Decide which direction.'),
  original('Read less. Recall more. Miss nothing twice.'),
  original("The syllabus is finite. Your excuses shouldn't be infinite."),
  original('Every tagged mistake is a future trap disarmed.'),
  original('You came for a rank, not a participation story.'),
  original('Outwork the version of you that keeps asking for Monday.'),
  original('Let the mock test talk. Then answer with corrections.'),
  original('Precision is louder than potential.'),
  original('Start cold. Finish dangerous.'),
  original('The plan is small. The consequences are not.'),
  original('Build the reflex now; collect the mark in February.'),
  original('One hard block can change the temperature of your whole day.'),
  original('No drama. No delay. Just the next target.'),
  original('The question setter brought traps. Bring receipts.'),
  original('Be so prepared the hard set feels familiar.'),
  original('Your edge is hidden inside the work you keep postponing.'),
  original('Win the hour. Let the rank handle itself.'),
  original("You don't rise to ambition. You fall to preparation."),
  original('Make consistency look like talent.'),
  original('Average waits for the mood. You start the timer.'),
  original("The goal isn't to study everything. It's to miss nothing predictable."),
  original('Brutal honesty today. Brutal accuracy on exam day.'),
  original("The backlog isn't a verdict. It's a hit list."),
  original('Turn every wrong answer into stolen intelligence.'),
  original('Your future rank is watching what you do with this hour.'),
  original('The cleanest flex is a completed plan.'),
  original('Stop auditioning for success. Rehearse the paper.'),
  original('They hope the easy questions appear. You prepare for the ugly ones.'),
  original('Quiet room. Loud ambition.'),
  original('The exam is one day. Your advantage is built daily.'),
  original("A re-attempt isn't punishment. It's where marks come back."),
  original('Face the chapter that keeps shrinking your confidence.'),
  original('Speed without accuracy is just expensive panic.'),
  original('Your comfort zone has never solved a NAT question.'),
  original("Don't fear the clock. Train it."),
  original('If it exposed you once, master it before it returns.'),
  original("The day doesn't need hype. It needs a first move."),
  original('Be bored. Be tired. Be consistent. Then be ranked.'),
  original('Nobody can compete with your corrected mistakes.'),
  original("You're not chasing AIR. You're engineering it."),
  original('IISc is not a dream campus. It is what happens when your rank becomes undeniable.'),
  original('Make Bengaluru the destination and AIR < 100 the ticket. IISc is earned here.'),
  original('Powai looks better from inside IIT Bombay. Earn the view.'),
  original('IIT Bombay does not admit potential. It admits the score your discipline built.'),
  original('IIT Madras is waiting at the end of the questions you keep avoiding.'),
  original('Turn this hour into the rank that walks through IIT Madras without asking permission.'),
  {
    text: "I don't have dreams. I have goals.",
    attribution: 'Harvey Specter · Suits'
  },
  {
    text: 'One step at a time. One punch at a time. One round at a time.',
    attribution: 'Rocky Balboa · Creed'
  },
  {
    text: 'Why do we fall? So we can learn to pick ourselves up.',
    attribution: 'Alfred Pennyworth · Batman Begins'
  },
  {
    text: 'Do, or do not. There is no try.',
    attribution: 'Yoda · The Empire Strikes Back'
  }
];

/** Deterministic per-day pick, seeded by ISO date + user id so multiple
 *  users on the same day see different quotes but each user is stable. */
export function pickQuoteForDay(isoDate: string, seedSalt = ''): QuotePreset {
  const src = `${isoDate}:${seedSalt}`;
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return QUOTES[h % QUOTES.length];
}

export function greetingForHour(hour: number, firstName: string): string {
  const who = firstName.trim() ? firstName.trim() : 'friend';
  if (hour < 5) return `Late night, ${who}.`;
  if (hour < 12) return `Good morning, ${who}.`;
  if (hour < 17) return `Good afternoon, ${who}.`;
  if (hour < 21) return `Good evening, ${who}.`;
  return `Late night, ${who}.`;
}
