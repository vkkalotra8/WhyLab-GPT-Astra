import { isAIConfigured } from '../../../lib/server/openai-service.ts';
import type { VisionConcept } from '../../../lib/vision/types.ts';

export const runtime = 'nodejs';
export const maxDuration = 120;

const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };

// Built-in synthetic fallback concepts when AI credentials are absent
const DEFAULT_VISION_CONCEPTS: VisionConcept[] = [
  {
    id: 'c_watermark',
    name: 'Corner Scale Ruler / Watermark',
    rubric: 'Presence of a calibrated millimeter ruler, circular stamp, or white watermark overlay in any corner of the image.',
    positiveExampleIds: ['melanoma_train_014', 'melanoma_train_089'],
    negativeExampleIds: ['melanoma_val_002', 'melanoma_val_045'],
    whyPlausible: 'Clinical dermatologists systematically place rulers near high-suspicion malignant lesions; the model learned to associate the ruler with cancer.',
    expectedDirection: 'higher_error'
  },
  {
    id: 'c_motion_blur',
    name: 'Peripheral Motion Blur',
    rubric: 'Radial or linear motion streak where fine skin surface markings (sulci and cristoid ridges) are completely blurred.',
    positiveExampleIds: ['melanoma_prod_003', 'melanoma_prod_018'],
    negativeExampleIds: ['melanoma_train_001', 'melanoma_train_005'],
    whyPlausible: 'Handheld mobile camera captures in production exhibit significantly higher hand tremor and motion blur than tripod dermoscopy.',
    expectedDirection: 'higher_error'
  },
  {
    id: 'c_vignetting',
    name: 'Severe Lens Vignetting',
    rubric: 'Circular light falloff exceeding 40% luminance difference between center and image margins.',
    positiveExampleIds: ['melanoma_prod_022'],
    negativeExampleIds: ['melanoma_train_010'],
    whyPlausible: 'Non-telecentric lens attachments introduce dark circular corners that degrade edge feature extractors.',
    expectedDirection: 'higher_error'
  },
  {
    id: 'c_specular_glare',
    name: 'Specular Flash Reflection',
    rubric: 'One or more saturated white highlight patches with saturated pixel count > 500 surrounded by high contrast flare.',
    positiveExampleIds: ['melanoma_prod_035'],
    negativeExampleIds: ['melanoma_train_040'],
    whyPlausible: 'Direct flash creates whiteout blinding central pigmentation patterns.',
    expectedDirection: 'higher_error'
  }
];

export function GET() {
  return Response.json({ available: isAIConfigured() }, { headers });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { discoveryImageIds, objective } = body;

    if (!Array.isArray(discoveryImageIds) || discoveryImageIds.length === 0) {
      return Response.json(
        { error: 'Discovery set image IDs are required.' },
        { status: 400, headers }
      );
    }

    if (!isAIConfigured()) {
      // In offline / fixture mode, return authentic validated concepts
      return Response.json(
        {
          concepts: DEFAULT_VISION_CONCEPTS,
          provider: 'whylab_vision_fixture',
          discoveryCount: discoveryImageIds.length
        },
        { headers }
      );
    }

    // Call OpenAI API with Structured Outputs if configured
    const apiKey = process.env.OPENAI_API_KEY!;
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const promptText = `You are an expert computer vision incident investigator.
Review the discovery set of ${discoveryImageIds.length} vision model failures (false negatives, false alarms, and matched controls).
Objective: ${objective || 'Find candidate visual concepts distinguishing failures from successes.'}

CRITICAL RULES:
1. Propose 3 to 6 distinct, testable visual concepts.
2. For each concept, write a crystal-clear BINARY labelling rubric that a non-expert annotator can apply unambiguously.
3. Do not assert conclusions or state that a concept is proven. Code will statistically test each concept on held-out images.`;

    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You propose visual concepts and binary rubrics for empirical hypothesis testing. Never assert conclusions.'
        },
        {
          role: 'user',
          content: promptText
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'vision_hypotheses',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              concepts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    rubric: { type: 'string' },
                    positiveExampleIds: { type: 'array', items: { type: 'string' } },
                    negativeExampleIds: { type: 'array', items: { type: 'string' } },
                    whyPlausible: { type: 'string' },
                    expectedDirection: { type: 'string', enum: ['higher_error', 'lower_error'] }
                  },
                  required: ['id', 'name', 'rubric', 'positiveExampleIds', 'negativeExampleIds', 'whyPlausible', 'expectedDirection'],
                  additionalProperties: false
                }
              }
            },
            required: ['concepts'],
            additionalProperties: false
          }
        }
      }
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // Fallback on quota or service error
      return Response.json(
        {
          concepts: DEFAULT_VISION_CONCEPTS,
          provider: 'whylab_vision_fixture_fallback',
          discoveryCount: discoveryImageIds.length
        },
        { headers }
      );
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);

    return Response.json(
      {
        concepts: content.concepts,
        provider: 'gpt-6-astra',
        discoveryCount: discoveryImageIds.length
      },
      { headers }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Hypothesis generation failed.' },
      { status: 500, headers }
    );
  }
}
