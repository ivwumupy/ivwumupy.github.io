---
title: "Why the Bellman operator forgets its initial guess"
description: "The contraction argument behind value iteration, with the one inequality that does all the work."
published: 2026-06-28
topics:
  - math
  - reinforcement-learning
featured: true
---

Value iteration starts with an arbitrary function $V_0$ and repeatedly
applies the Bellman optimality operator. The surprising part is not that this
can work. It is that, under the standard assumptions, the starting point does
not matter at all.

For a discounted Markov decision process, define

$$
(\mathcal{T}V)(s)
= \max_a \left[
  r(s,a) + \gamma\,\mathbb{E}_{s' \sim P(\cdot\mid s,a)} V(s')
\right],
$$

where $0 \le \gamma < 1$. We want to compare what happens to two candidate
value functions $V$ and $W$.

## The key inequality

For any two collections of real numbers $x_a$ and $y_a$,

$$
\left|\max_a x_a - \max_a y_a\right|
\le \max_a |x_a-y_a|.
$$

Apply this at a fixed state. The reward terms cancel, leaving

$$
\begin{aligned}
|(\mathcal{T}V)(s)-(\mathcal{T}W)(s)|
&\le \gamma \max_a
\left|\mathbb{E}[V(s')-W(s')]\right| \\
&\le \gamma \lVert V-W\rVert_\infty.
\end{aligned}
$$

Taking the supremum over states gives

$$
\lVert \mathcal{T}V-\mathcal{T}W\rVert_\infty
\le \gamma \lVert V-W\rVert_\infty.
$$

That is the whole convergence engine. The Bellman operator shrinks every
sup-norm distance by at least a factor of $\gamma$.

## What the contraction buys us

The Banach fixed-point theorem now gives three facts at once:

1. There is a unique fixed point $V^\star$.
2. Repeated application of $\mathcal{T}$ converges to $V^\star$ from any
   bounded initial function.
3. The error after $k$ iterations satisfies
   $\lVert V_k-V^\star\rVert_\infty \le \gamma^k\lVert V_0-V^\star\rVert_\infty$.

The discount factor has two jobs, then. It encodes how future rewards are
weighted, and it makes the dynamic-programming update contractive. As
$\gamma$ approaches one, long-term rewards matter more while the guaranteed
rate of convergence gets worse.

## Where the story changes

The proof depends on a tabular, exact operator acting on complete value
functions. Function approximation, sampling noise, and off-policy updates can
break the direct contraction argument. That is why the same reassuring proof
does not automatically transfer to every deep RL algorithm.

Still, it is a good reference point. When an algorithm becomes unstable, one
productive question is: which part of this contraction structure did we lose?
