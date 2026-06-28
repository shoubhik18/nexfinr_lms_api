import { z } from 'zod';

const uuid = z.string().uuid();

const questionSchema = z
  .object({
    text: z.string().trim().min(1).max(1200),
    options: z.array(z.string().trim().min(1).max(600)).min(4).max(5),
    correctOptionIndex: z.number().int().min(0).max(4),
  })
  .superRefine((question, ctx) => {
    if (question.correctOptionIndex >= question.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctOptionIndex'],
        message: 'Correct answer must point to an existing option',
      });
    }
  });

const assessmentBodySchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(2000).optional().default(''),
  timeLimitMinutes: z.coerce.number().int().min(1).max(480).default(30),
  allowRetake: z.boolean().optional().default(false),
  questions: z.array(questionSchema).min(1),
  learnerIds: z.array(uuid).optional().default([]),
});

/** LMS validate middleware parses req.body directly (not { body, params }). */
export const createAssessmentSchema = assessmentBodySchema;

export const updateAssessmentSchema = assessmentBodySchema;

export const releaseResultsSchema = z.object({
  released: z.boolean(),
});

export const setActiveSchema = z.object({
  active: z.boolean(),
});

export const assignLearnersSchema = z.object({
  learnerIds: z.array(uuid).default([]),
});

export const submitAssessmentSchema = z.object({
  answers: z
    .array(z.object({ questionId: uuid, optionId: uuid }))
    .default([]),
  timedOut: z.boolean().optional().default(false),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;
export type SubmitAssessmentInput = z.infer<typeof submitAssessmentSchema>;
