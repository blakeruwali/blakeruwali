# AI for ServiceTitan users: what I built around it and what it takes

**Meta description:** AI for ServiceTitan users: how a phone agent, estimate drafts, online booking and follow-up work around ServiceTitan, and why a clean price book comes first.
**Suggested URL:** /ai-with-servicetitan/
**Byline:** Blake Ruwali, owner of Home+ Air & Heat and founder of Techeo

AI works well for ServiceTitan users when it reads from and writes to ServiceTitan, because that is where your customers, jobs, price book and schedule already live. At Home+, AI creates leads from phone calls, drafts estimates from the price book, books online from real slots and runs follow-up, and a person approves anything about money, scope or safety. An AI that sits outside your system of record just creates one more inbox.

I'm Blake. I run Home+ Air & Heat, and our jobs live in ServiceTitan. I build the AI we use around it. I'm describing what we did in general terms, not documenting ServiceTitan's features. What your account can do depends on your setup, so check with ServiceTitan and any vendor you work with.

## Why the system of record matters

Think about what happens when an AI tool lives off to the side. It takes a call and texts you the details. Someone retypes them into the system. It drafts an estimate in its own window. Someone copies it over. Every handoff is a place for mistakes and a reason the office stops using it.

When AI reads and writes the system you already run, the work lands where your team works. A phone call becomes a record. A draft estimate becomes something a person opens, checks and sends. Your schedule is the source of truth, not a copy of it.

It also works the other way. The AI needs to read, not just write: your price book, your customer history, your open slots. If it's guessing at those, it's guessing at your business.

## What we built around it

### A phone agent that creates leads

For calls the office can't answer, an AI phone agent collects the problem, address and callback number, asks a few triage questions and creates a lead in the system for a person to follow up. It does not diagnose, quote or promise arrival times, and safety calls go to a person. Setup is in [how to answer every missed call with AI](/missed-calls-ai/).

### Estimate drafts from the price book

A tech takes photos. Our estimate copilot reads them and drafts a proposal using the company's own price book. It can only choose from lines we've already set, so it doesn't invent prices. A person checks every draft before the customer sees it. More in [AI estimates with a human check](/ai-estimates/).

### Online booking from real slots

Customers see open times that reflect the real schedule instead of "we'll call you back." The point is that booking creates a real job against real availability. I cover it in [AI online booking](/ai-online-booking/).

### Follow-up campaigns

Unsold estimates, maintenance reminders and paperwork nudges run on a schedule and stop when a customer replies. A person answers real questions. See [AI follow-up for unsold estimates](/ai-estimate-follow-up/).

## The prerequisite: a clean price book

This is the unglamorous part and the most important one. An estimate draft is only as good as the price book it picks from. If your price book has duplicate items, old prices, vague names or items nobody uses, the AI will choose from the mess, and a person will spend their time cleaning up drafts.

Before you let AI draft anything:

- Remove or deactivate items you no longer sell.
- Make names and descriptions clear enough that a new hire would pick the right one.
- Check that prices are current and that someone owns keeping them current.
- Check that what's bundled and what's separate is deliberate.

I wouldn't start with estimate drafting until this is done. Start with calls or follow-up, where a messy price book doesn't matter.

## A person approves

AI in our shop drafts and prepares. A person decides. Specifically:

- A person checks every estimate before it goes out.
- The phone agent doesn't quote, diagnose or promise times.
- Anything about money, scope or safety gets human eyes.
- We listen to call recordings and review what the AI wrote.

This isn't a legal disclaimer. It's how we keep an error from reaching a customer.

## Questions to ask before connecting anything

1. What exactly does it read, and what exactly does it write?
2. Can you show me a real call or estimate becoming a real record in my account?
3. What happens if the connection breaks? Does work queue up or disappear?
4. Who owns the data, and what do I keep if I leave?
5. What can I turn off myself?
6. Who at my company has to review what, and how often?

For a fuller list, see [how I'd pick an AI partner](/ai-partner-questions/). If you're sorting tools by job, see [AI tools for HVAC owners](/ai-tools-for-hvac-owners/).

## Where I'd start

1. Count your missed calls and open estimates.
2. Start with the phone agent or follow-up, because they don't depend on the price book.
3. Clean the price book in parallel.
4. Add estimate drafting once the book is clean, with a person reviewing each draft.

## FAQ

**Can AI work with ServiceTitan?**
It can when the tool is connected to your account. Ask any vendor to show a real call or estimate becoming a real record in your system, and ask exactly what it can read and write.

**Why does AI need to read and write my field service system?**
Because that's where your customers, jobs, price book and schedule live. Without access, someone retypes the details, and the AI is guessing about your business.

**Do I need a clean price book first?**
For estimate drafting, yes. The AI picks from your price book, so duplicates, old prices and vague names turn into bad drafts. Calls and follow-up don't depend on it.

**Will AI send estimates to customers on its own?**
Not in our shop. A person reviews every estimate before it goes out, because it involves price and scope.

**Is this ServiceTitan's own AI?**
No. I'm describing what we built around ServiceTitan at Home+. I'm not describing ServiceTitan's own products, and I'd check with them about what your account includes.
