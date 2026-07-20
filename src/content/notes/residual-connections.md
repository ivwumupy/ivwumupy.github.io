---
title: "Residual Connections"
published: 2026-07-18
---

# Hyper Connections

The standard hyper connection expands the width of the residual connection by a factor of $n_{\text{hc}}$.
In other words, residual states are
$$
X_{l} = \begin{bmatrix} x_{l, 1} & \ldots & x_{l, n_{\text{hc}}} \end{bmatrix} \in \mathbb{R}^{d \times n_{\text{hc}}}
$$
before the $l$-th layer.
HC introduces three linear mappings $A_l \in \mathbb{R}^{n_{\text{hc}}}, B_l \in \mathbb{R}^{n_{\text{hc}} \times n_{\text{hc}}}, C_l\in\mathbb{R}^{n_{\text{hc}}}$.
The update of the residual stream is then
$$
X_{l+1} = X_l B_l + \mathcal{F}_l(X_l A_l) C_l^{\top}.
$$

## Manifold-Constrained Residual Mappings

mHC imposes following constraint on $B_l$
$$
B_l \in \mathcal{M} = \{ M \in \mathbb{R}^{n\times n} \mid M 1_n = 1_n, 1_n^{\top} M = 1_n^{\top}, M \ge 0 \}
$$
i.e. $B_l$ is a doubly-stochastic matrix (also see the Birkhoff polytope).
It ensures that $\| B_l\|_2 \le 1$, so the residual transformation is non-expansive, which improves training stability.