# WhyLab Vision: Statistical Methodology & Mathematical Provenance

**Version**: 1.0 (Production Release)  
**Core Principle**: *Astra proposes. Deterministic code disposes.*

WhyLab Vision extends post-deployment machine learning failure investigation to computer vision. To maintain complete scientific credibility and prevent false claims, every metric, confidence interval, and diagnostic decision follows standard, reproducible mathematical procedures documented below.

---

## 1. Disjoint Discovery vs. Held-Out Falsification

A fundamental pitfall in multimodal LLM evaluations is **data snooping / circular validation**: evaluating an error concept on the very images the model inspected to hypothesize it.

WhyLab enforces strict split isolation:
1. **Discovery Set ($\mathcal{D}_{disc}$)**: A small, bounded set ($K \le 40$ images) composed deterministically of:
   - Top-k false negatives sorted by lowest predicted probability (worst misses).
   - Top-k false positives sorted by highest predicted probability (worst false alarms).
   - Top-k high-confidence errors.
   - Matched true-positive and true-negative controls.
2. **Held-Out Test Set ($\mathcal{D}_{test}$)**: All remaining images ($\mathcal{D}_{test} \cap \mathcal{D}_{disc} = \emptyset$).
   - Astra *never* sees held-out images during hypothesis generation.
   - All effect sizes, differences in proportions, and confidence intervals are computed exclusively on $\mathcal{D}_{test}$.

---

## 2. Statistical Hypothesis Testing of Visual Concepts

### 2.1 Two-Proportion Difference Test

Let:
- $n_1$: Total held-out images possessing visual concept $C$.
- $k_1$: Number of prediction errors among images with concept $C$ ($p_1 = k_1 / n_1$).
- $n_2$: Total held-out images lacking visual concept $C$.
- $k_2$: Number of prediction errors among images without concept $C$ ($p_2 = k_2 / n_2$).

The observed difference in error rates is:
$$\Delta p = p_1 - p_2$$

#### Minimum Cell Floor
If $n_1 < 25$ or $n_2 < 25$, the sample size is statistically underpowered to reliably estimate proportion differences. The test halts and outputs `underpowered` rather than reporting an unstable percentage or p-value.

#### Newcombe–Wilson Score Confidence Interval
Rather than Wald intervals (which perform poorly near boundaries), WhyLab computes the Newcombe–Wilson score interval for the difference between two independent proportions ($1 - \alpha = 0.95, z = 1.95996$):

$$CI_{lower} = \Delta p - \sqrt{(p_1 - l_1)^2 + (u_2 - p_2)^2}$$
$$CI_{upper} = \Delta p + \sqrt{(u_1 - p_1)^2 + (p_2 - l_2)^2}$$

where $[l_i, u_i]$ are the single-proportion Wilson score intervals:
$$l_i, u_i = \frac{p_i + \frac{z^2}{2n_i} \pm z\sqrt{\frac{p_i(1-p_i)}{n_i} + \frac{z^2}{4n_i^2}}}{1 + \frac{z^2}{n_i}}$$

#### Significance Testing & Small-Sample Fallback
- If all 4 cells $\min(k_1, n_1 - k_1, k_2, n_2 - k_2) \ge 5$, a two-tailed pooled $z$-test is performed:
  $$p_{pool} = \frac{k_1 + k_2}{n_1 + n_2}, \quad SE = \sqrt{p_{pool}(1 - p_{pool}) \left(\frac{1}{n_1} + \frac{1}{n_2}\right)}, \quad z = \frac{p_1 - p_2}{SE}$$
- If any cell $< 5$, **Fisher's Exact Test** is computed by summing hypergeometric probabilities across all $2\times2$ contingency tables with probabilities $\le P(\text{observed table})$.

---

### 2.2 Multiple Comparison Control: Benjamini–Hochberg Procedure

When testing $m$ candidate visual concepts in an investigation, raw p-values suffer from the multiple testing problem. Reporting the minimum p-value without adjustment is p-hacking.

WhyLab controls the **False Discovery Rate (FDR)** at $\alpha = 0.05$ using the Benjamini–Hochberg (1995) step-up procedure:
1. Sort raw p-values ascending: $P_{(1)} \le P_{(2)} \le \dots \le P_{(m)}$.
2. Adjusted p-values are computed as:
   $$P_{adj(i)} = \min\left(1, \min_{k \ge i} \left\{ \frac{m}{k} P_{(k)} \right\} \right)$$
3. A concept is statistically significant if and only if $P_{adj} < 0.05$.

---

### 2.3 Labeller Self-Consistency Audit: Cohen's Kappa ($\kappa$)

LLMs applied as visual annotators can be inconsistent or sensitive to prompt ordering. WhyLab audits labeller reproducibility by re-labelling a random $10\%$ subset of images with shuffled order.

Let:
- $P_o$: Observed fraction of identical binary classifications.
- $P_e$: Expected agreement by chance ($P_e = p_{1}p_{2} + (1 - p_{1})(1 - p_{2})$).

$$\kappa = \frac{P_o - P_e}{1 - P_e}$$

- $\kappa \ge 0.60$: Labelling is considered reliable and reproducible.
- $\kappa < 0.60$: The concept's binary rubric is judged ambiguous or non-reproducible. The verdict is forced to `unreliable_labelling` regardless of the apparent effect size.

---

### 2.4 Stratified Confound Testing

A concept (e.g. "outdoor glare") might correlate with a known acquisition site or low camera resolution. To verify that the concept is not merely proxying an existing metadata or pixel confound:
1. The held-out dataset is partitioned into strata (by collection site and sharpness quintiles).
2. The difference in error rates is re-measured within each stratum.
3. If the effect direction does not persist across at least $70\%$ of valid strata, the verdict is downgraded to `weakened (confounded)`.

---

## 3. Deterministic Image Profiling Algorithms

All pixel statistics execute client-side with zero network transmission:

| Metric | Algorithm / Formula | Purpose |
| :--- | :--- | :--- |
| **Luminance ($Y$)** | $Y = 0.299R + 0.587G + 0.114B$ (Rec. 601) | Baseline brightness |
| **RMS Contrast** | $\frac{1}{255} \sqrt{\frac{1}{N} \sum (Y_i - \bar{Y})^2}$ | Dynamic range & flat contrast detection |
| **Colorfulness** | Hasler–Süsstrunk metric: $\sigma_{rgyb} + 0.3 \mu_{rgyb}$ | Saturation & color vibrancy |
| **Sharpness** | Variance of 2D discrete Laplacian convolution $\nabla^2 I$ | Motion blur & defocus detection |
| **Edge Density** | Fraction of pixels with Sobel gradient magnitude $> 40$ | Structural complexity |
| **Noise Estimate** | $1.4826 \times \text{median}(\|\nabla^2 I - \text{median}(\nabla^2 I)\|)$ (MAD) | Sensor noise & ISO grain |
| **JPEG Quality** | $8\times8$ DCT block boundary step discontinuities vs. interior | Compression artifact severity |
| **dHash (64-bit)** | $9\times8$ downsampling, row-wise gradient comparison | Perceptual near-duplicate detection |

---

## 4. Cross-Split Near-Duplicate Leakage (BK-Tree)

Train/test contamination in computer vision occurs when near-identical frames (burst captures, video crops, re-encodings) appear in both training and test splits.

- **Index**: 64-bit dHashes are inserted into a **Burkhard-Keller Tree (BK-Tree)** using Hamming distance as the metric.
- **Search**: Hamming distance $d \le 6$ bits ($\approx 90\%$ perceptual bit agreement) flags a near-duplicate pair.
- **Leakage Inflation Gap**:
  $$\Delta Acc = Acc_{leaked} - Acc_{clean}$$
  WhyLab computes the $95\%$ Newcombe–Wilson interval for $\Delta Acc$. A positive gap demonstrates that the reported test metric was artificially inflated by leakage.
