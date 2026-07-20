---
title: "Linear Attentions"
published: 2026-07-19
---

Linear attention maintains a matrix-valued recurrent state
$$
S_t = S_{t-1} + k_t v_t^{\top}, \quad o_t = S_t^{\top} q_t.
$$
In particular,
$o_t = S_{t-1}^{\top}q_t + v_t k_t^{\top} q_t$.
From the fast-weight perspective, $S_t$ serves as a memory mapping from keys to values.
Updates can be viewed as gradient descent on the unbounded correlation objective
$$
L_t(S) = - \langle S^{\top} k_t, v_t \rangle.
$$

Another objective the is reconstruction objective (proposed by DeltaNet)
$$
L_t(S) = \frac{1}{2} \| S^{\top} k_t - v_t \|^2.
$$
It induces the update rule
$$
S_t = S_{t-1} - \beta_t \nabla L_t(S_{t-1}) = (I - \beta_t k_t k_t^{\top}) S_{t-1} + \beta_t k_t v_t^{\top}.
$$

Gated DeltaNet introduces weight decay to DeltaNet
$$
S_t = \alpha_t (I - \beta_t k_t k_t^{\top}) S_{t-1} + \beta_t k_t v_t^{\top}.
$$

Kimi Delta Attention upgrades the weight decay to fine-grained gating
$$
S_t = (I - \beta_t k_t k_t^{\top}) \operatorname{diag}(\alpha_t) S_{t-1} + \beta_t k_t v_t^{\top}.
$$