---
title: "Quadratic Attentions"
published: 2026-07-18
---

Let's review standard MHA mechanism.
Let $d$ be the embedding dimension, $n_h$ be the number of attention heads, $d_h$ be the dimension per head.
Let $h_t \in \mathbb{R}^{d}$ be the attention input of the $t$-th token at some layer.
MHA first produces $q_t, k_t, v_t \in \mathbb{R}^{d_h n_h}$ through three matrices $W^Q, W^K, W^V \in \mathbb{R}^{d_h n_h \times d}$, respectively:
$$
q_t = W^Q h_t, \quad k_t = W^K h_t, \quad v_t = W^V h_t.
$$
Then $q_t, k_t, v_t$ will be sliced into $n_h$ heads
$$
[q_{t,1}; \ldots; q_{t,n_h}] = q_t, \quad [k_{t,1}; \ldots; k_{t,n_h}] = k_t, \quad [v_{t,1}; \ldots; v_{t,n_h}] = v_t.
$$
Then
$$
o_{t,i} = \sum_{j=1}^{t} \operatorname{softmax}_j (q_{t,i}^{\top} k_{\cdot, i}) v_{j, i}
$$
and
$$
u_t = W^O [o_{t,1}; \ldots; o_{t,n_h}].
$$
Here we omit the scaling in the softmax for simplicity.
The total parameters count is $3 n_h d_h d$, and kv cache size is $2 n_h d_h$.
