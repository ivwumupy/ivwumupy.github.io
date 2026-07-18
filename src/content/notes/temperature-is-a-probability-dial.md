---
title: "Temperature is a probability dial, not a creativity knob"
description: "A short derivation of what temperature actually changes in a softmax distribution."
published: 2026-07-12
topics:
  - math
  - llm-architecture
featured: true
---

Temperature is usually introduced through a metaphor: turn it up for more
creativity, turn it down for more focus. The metaphor is serviceable, but it
hides the useful part. Temperature controls how strongly a categorical
distribution responds to differences between logits.

Given logits $z_1,\ldots,z_n$, define

$$
p_i(T) = \frac{\exp(z_i/T)}{\sum_j \exp(z_j/T)}, \qquad T > 0.
$$

Everything worth knowing follows from this expression.

## The two limits

As $T \to 0^+$, every non-maximal logit is exponentially suppressed. If
there is a unique maximum, the distribution converges to a point mass on that
index. As $T \to \infty$, each $z_i/T$ converges to zero and the
distribution converges to uniform.

This gives the familiar behavior, but it does not yet tell us whether the
change is orderly. Could entropy wobble as the temperature increases?

## Entropy only moves one way

Write $\beta = 1/T$ and $Z(\beta)=\sum_j \exp(\beta z_j)$. The entropy is

$$
H(p) = \log Z(\beta) - \beta\,\mathbb{E}_p[z].
$$

Differentiate first with respect to $\beta$:

$$
\frac{dH}{d\beta}
= -\beta\,\operatorname{Var}_p(z).
$$

Since $d\beta/dT=-1/T^2$, the chain rule gives

$$
\frac{dH}{dT}
= \frac{\operatorname{Var}_p(z)}{T^3} \ge 0.
$$

So entropy is monotone in temperature. It increases strictly whenever the
logits are not all equal. Temperature is not making a mysterious semantic
choice; it is moving the distribution along a one-dimensional, increasingly
entropic path.

## A practical detail

Dividing by a small temperature magnifies logits, so the usual numerical
stability trick matters even more:

~~~python
def tempered_softmax(logits, temperature):
    scaled = logits / temperature
    shifted = scaled - scaled.max()
    weights = shifted.exp()
    return weights / weights.sum()
~~~

In an actual decoder, temperature also interacts with top-$p$, top-$k$,
and any repetition penalty. Those operations alter or truncate the
distribution, so the clean monotonic statement above no longer describes the
whole sampling pipeline. It still describes the temperature step itself—and
that is the right piece to reason about first.
