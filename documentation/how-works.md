# How it works

MapMind works by combining a persistent graph workspace with a constrained AI loop.

## 1. The graph is the world state

The graph is not generated for one screenshot and then forgotten.

It is a persistent state containing:

- topics
- edges
- regions
- topic resources
- topic artifacts
- progress state
- quiz state
- snapshots

That persistent state is what gives the assistant real context.

## 2. The assistant does not operate on a blank prompt

When you ask for help, the model can receive a context pack built from the workspace:

- current graph
- selected topic
- learning progress
- closure state
- recent chat history
- configured role
- configured language
- memory preset
- provider and model settings

This is why the assistant feels different from a generic chat tab. It is grounded in the path you are actually on.

## 3. The system chooses between different action shapes

Depending on the request, the assistant may:

- answer directly
- create an inline quiz
- generate a graph proposal from source material
- generate a graph expansion toward a target

These are not all the same output type. The system uses typed boundaries so the model is not just returning free-form prose in every situation.

## 4. Graph mutation is proposal-based

This is one of the strongest design choices in the product.

The assistant does not silently edit the graph. It returns a proposal. That proposal can then be:

- reviewed
- applied
- rejected

If applied, it becomes part of the graph history.

## 5. Accepted changes are snapshot-based

Every meaningful graph change can produce a snapshot.

That gives the workspace a practical recovery model:

- move fast
- inspect the result
- roll back if needed

Without that, AI-assisted editing would be much harder to trust.

## 6. Topic closure can be verified

Completion is not only visual.

MapMind supports closure tests so topics can be marked complete through actual verification. If a workspace does not need that strictness, the quiz flow can be disabled and the user can mark a topic as finished directly.

That makes the system usable across both:

- stricter study environments
- lighter exploratory learning

## 7. The provider layer is modular

The local edition ships with:

- Gemini
- OpenAI

The provider boundary is explicit, so developers can add their own providers later.

## In one sentence

MapMind works by keeping a graph as the persistent learning state, building dynamic context from that state, letting AI produce typed actions instead of silent edits, and keeping accepted changes reviewable and reversible.
