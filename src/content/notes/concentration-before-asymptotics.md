---
title: "Concentration before asymptotics"
description: "Why a finite-sample bound is often the better first question when estimating a mean."
published: 2026-05-21
topics:
  - math
---

Suppose $X_1,\ldots,X_n$ are independent observations in $[0,1]$ with
mean $\mu$, and let

$$
\widehat{\mu}_n = \frac{1}{n}\sum_{i=1}^n X_i.
$$

The law of large numbers says $\widehat{\mu}_n$ converges to $\mu$. The
central limit theorem describes the limiting shape of its fluctuations. Both
are essential results, but neither directly answers the operational question:
how many samples do I need today?

## Ask for a probability

Hoeffding's inequality gives

$$
\Pr\left(
  |\widehat{\mu}_n-\mu| \ge \varepsilon
\right)
\le 2\exp(-2n\varepsilon^2).
$$

If we want the estimation error to be at most $\varepsilon$ with probability
at least $1-\delta$, it is enough to choose

$$
n \ge \frac{\log(2/\delta)}{2\varepsilon^2}.
$$

The bound is explicit, non-asymptotic, and makes its tradeoffs visible.
Halving the target error costs four times as many samples. Asking for ten
times more confidence adds only logarithmically to the requirement.

## The price of being distribution-free

Hoeffding only uses boundedness and independence. That makes it broadly
applicable and sometimes conservative. If the variance is much smaller than
the worst case, a Bernstein-style inequality can give a tighter answer. If
observations are dependent, the premise needs to change before the algebra
does.

This suggests a useful order of operations:

1. State the event you want to control.
2. Write down the assumptions you actually have.
3. Use a finite-sample inequality that matches those assumptions.
4. Reach for an asymptotic approximation when it adds information.

Asymptotic results tell us what eventually happens. Concentration inequalities
force us to say what accuracy, confidence, and sample size mean in the problem
in front of us. That is often the more clarifying first move.
