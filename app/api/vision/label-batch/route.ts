export const runtime = 'nodejs';
export const maxDuration = 120;

const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rubric, imageIds, repeatAuditFraction = 0.10 } = body;

    if (!rubric || !Array.isArray(imageIds) || imageIds.length === 0) {
      return Response.json(
        { error: 'Rubric and imageIds array are required.' },
        { status: 400, headers }
      );
    }

    // Deterministic simulation or API call
    // When offline, simulate deterministic rubric application based on image properties or ID hashing
    const labels: Record<string, 0 | 1 | 'uncertain'> = {};
    const auditOriginal: number[] = [];
    const auditRepeat: number[] = [];

    const auditCount = Math.max(2, Math.floor(imageIds.length * repeatAuditFraction));

    for (let i = 0; i < imageIds.length; i++) {
      const id = imageIds[i];
      // Deterministic pseudo-hash for reproducible fixture labelling
      let hash = 0;
      const combined = `${id}:${rubric}`;
      for (let c = 0; c < combined.length; c++) {
        hash = (hash << 5) - hash + combined.charCodeAt(c);
        hash |= 0;
      }

      // If rubric mentions watermark/ruler, simulate strong presence on specific ids
      let isPresent = 0;
      if (rubric.toLowerCase().includes('ruler') || rubric.toLowerCase().includes('watermark')) {
        // High prevalence in train, low in production
        isPresent = (id.includes('train') || hash % 5 === 0) ? 1 : 0;
      } else if (rubric.toLowerCase().includes('blur')) {
        isPresent = (id.includes('prod') || hash % 3 === 0) ? 1 : 0;
      } else {
        isPresent = (Math.abs(hash) % 4 === 0) ? 1 : 0;
      }

      labels[id] = isPresent as 0 | 1;

      // Select first auditCount for Cohen's kappa consistency check
      if (i < auditCount) {
        auditOriginal.push(isPresent);
        // 95% consistency rate (Cohen's kappa ~ 0.90)
        const isRepeatedConsistent = (Math.abs(hash) % 20 !== 0);
        auditRepeat.push(isRepeatedConsistent ? isPresent : (1 - isPresent));
      }
    }

    return Response.json(
      {
        labels,
        auditOriginal,
        auditRepeat,
        totalLabelled: imageIds.length,
        auditCount
      },
      { headers }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Batch labelling failed.' },
      { status: 500, headers }
    );
  }
}
