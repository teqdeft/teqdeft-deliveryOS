import { describe, expect, it } from 'vitest';
import { extractFragments } from '../modules/sources/extract.js';

describe('extractFragments', () => {
  it('addresses transcript lines by timestamp and speaker', () => {
    const transcript = [
      '00:00:12 Priya: We definitely need the booking form live before the trade show in March.',
      'That is the hard deadline for us, everything else can slip a little.',
      '00:01:45 Sam: Understood. And you will supply the product photography yourselves?',
      '00:02:03 Priya: Yes, our in-house team handles all the imagery for this campaign.',
    ].join('\n');

    const fragments = extractFragments(transcript, 'TRANSCRIPT');

    expect(fragments.length).toBeGreaterThanOrEqual(3);
    expect(fragments[0]!.locator).toBe('00:00:12 — Priya');
    expect(fragments[0]!.text).toContain('trade show in March');
    // The continuation line belongs to the same speaker turn.
    expect(fragments[0]!.text).toContain('hard deadline');
    expect(fragments.map((f) => f.locator)).toContain('00:02:03 — Priya');
  });

  it('numbers email messages within a thread', () => {
    const thread = [
      'Hello, following up on the proposal. We would like to add a blog section to the scope please.',
      '',
      'On Mon, 3 Mar 2026 at 09:14, Sam wrote:',
      'Thanks for the call today. Attached is the revised proposal covering the five page templates we discussed.',
    ].join('\n');

    const fragments = extractFragments(thread, 'EMAIL');

    expect(fragments.length).toBe(2);
    expect(fragments[0]!.locator).toBe('Message 1 of 2');
    expect(fragments[1]!.locator).toBe('Message 2 of 2');
  });

  it('addresses paragraphs within a single email, not the whole message', () => {
    const email = [
      'Hi Priya, thanks for the notes. Two corrections after speaking to the team internally today.',
      '',
      'First, the expo opens on the twenty-second of March, not the fifteenth as I said on our call.',
      '',
      'Second, the correct product count for launch is seventy-four, not the ninety I quoted you.',
    ].join('\n');

    const fragments = extractFragments(email, 'EMAIL');

    // One fragment per paragraph — a citation must point at the sentence a
    // reviewer needs to check, not at the entire email.
    expect(fragments).toHaveLength(3);
    expect(fragments.map((f) => f.locator)).toEqual(['Message, \u00b61', 'Message, \u00b62', 'Message, \u00b63']);
    expect(fragments[1]!.text).toContain('twenty-second');
    expect(fragments[2]!.text).toContain('seventy-four');
  });

  it('keeps character offsets pointing at the original text', () => {
    const email = [
      'Hi Priya, thanks for the notes. Two corrections after speaking to the team internally today.',
      '',
      'First, the expo opens on the twenty-second of March, not the fifteenth as I said on our call.',
    ].join('\n');

    for (const fragment of extractFragments(email, 'EMAIL')) {
      expect(email.slice(fragment.charStart, fragment.charEnd).trim()).toContain(fragment.text.slice(0, 30));
    }
  });

  it('addresses prose by page and paragraph', () => {
    const proposal =
      'This proposal covers the design and build of a five page marketing website for the client, including a content management system.\n\n' +
      'Hosting, domain registration and ongoing maintenance are explicitly excluded from this engagement and would be quoted separately.\n\f' +
      'The client is responsible for supplying all written content and imagery no later than two weeks before the agreed launch date.';

    const fragments = extractFragments(proposal, 'PROPOSAL');

    expect(fragments).toHaveLength(3);
    expect(fragments[0]!.locator).toBe('p. 1, ¶1');
    expect(fragments[1]!.locator).toBe('p. 1, ¶2');
    expect(fragments[1]!.text).toContain('explicitly excluded');
    expect(fragments[2]!.locator).toBe('p. 2, ¶1');
  });

  it('drops headings and stray lines that are too short to cite', () => {
    const doc = 'Scope\n\nOK\n\nThe website will support English and Hindi across every page, with a language switcher in the header.';
    const fragments = extractFragments(doc, 'PROPOSAL');

    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.text).toContain('language switcher');
  });

  it('gives every fragment a unique, contiguous ordinal', () => {
    const doc = Array.from(
      { length: 12 },
      (_, i) => `Paragraph number ${i} describing a requirement in enough detail to be worth citing later on.`,
    ).join('\n\n');

    const fragments = extractFragments(doc, 'BRIEF');

    expect(fragments.map((f) => f.ordinal)).toEqual(fragments.map((_, i) => i));
  });

  it('returns nothing for empty input rather than one empty fragment', () => {
    expect(extractFragments('', 'PROPOSAL')).toHaveLength(0);
    expect(extractFragments('   \n\n  ', 'PROPOSAL')).toHaveLength(0);
  });
});
