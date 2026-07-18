---
title: "The KV cache, from first principles"
description: "What autoregressive decoding saves, why memory grows linearly, and where grouped-query attention helps."
published: 2026-06-09
topics:
  - llm-architecture
featured: true
---

During autoregressive generation, a transformer processes one new token at a
time. Without a cache, each step would recompute attention keys and values for
every earlier token. The KV cache is simply the decision to retain those
intermediate tensors.

Consider one attention layer. For the hidden state $x_t$ at position $t$,
the layer forms

$$
q_t = x_t W_Q,\qquad k_t = x_t W_K,\qquad v_t = x_t W_V.
$$

To produce the next token, the new query $q_t$ attends to all keys
$k_1,\ldots,k_t$ and mixes the corresponding values. Earlier keys and values
do not change, so recomputing them is wasted work. Store them once; append one
pair at every decoding step.

## The memory formula

Let

- $L$ be the number of layers,
- $B$ the batch size,
- $S$ the cached sequence length,
- $H_{kv}$ the number of key/value heads,
- $D$ the head dimension, and
- $b$ the bytes per stored element.

Keys and values together require approximately

$$
2LBSH_{kv}Db \quad \text{bytes}.
$$

The dependence on sequence length is linear. For a 32-layer model with an
8,192-token context, 8 KV heads, head dimension 128, batch size 1, and
bfloat16 storage, the cache is about

$$
2\cdot32\cdot1\cdot8192\cdot8\cdot128\cdot2
= 2^{30}\ \text{bytes},
$$

or one GiB. With 32 KV heads, the same cache would occupy roughly four GiB.

## Why queries are not cached

Each query is used once: the query at the current position asks a question of
the prefix. Future positions create their own queries and never reuse the old
ones. Keys and values, in contrast, become part of the prefix that every later
query reads.

This asymmetry also explains grouped-query attention. Multiple query heads can
share one set of key/value heads. Reducing $H_{kv}$ lowers both cache memory
and memory bandwidth without reducing the number of query heads.

## The real bottleneck

Caching trades arithmetic for storage. Prefill—the initial pass over a
prompt—still has substantial parallel matrix multiplication. Decode repeatedly
reads a growing cache to produce a single new token, so it often becomes
limited by memory bandwidth rather than compute.

That distinction matters when evaluating an optimization. Quantizing the
cache, sharing KV heads, paging cache blocks, and speculative decoding look
like different techniques. All of them are responses to the same basic fact:
at decode time, moving the history can cost more than multiplying by it.
