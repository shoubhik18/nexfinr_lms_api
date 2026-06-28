import { z } from 'zod';

const mcqQuestionSchema = z
  .object({
    questionText: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    orderIndex: z.number().int(),
  })
  .superRefine((q, ctx) => {
    if (q.correctIndex >= q.options.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctIndex'],
        message: 'Correct answer must match one of the options',
      });
    }
  });

const baseAssignmentFields = {
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().nullish(),
};

export const createMCQSchema = z.object({
  type: z.literal('mcq'),
  ...baseAssignmentFields,
  orderIndex: z.number().int().default(0),
  questions: z.array(mcqQuestionSchema).min(1),
});

export const createTextSchema = z.object({
  type: z.literal('text'),
  ...baseAssignmentFields,
  orderIndex: z.number().int().optional(),
});

export const createCodeSchema = z.object({
  type: z.literal('code'),
  ...baseAssignmentFields,
  orderIndex: z.number().int().optional(),
});

export const createAssignmentSchema = z.discriminatedUnion('type', [
  createMCQSchema,
  createTextSchema,
  // createCodeSchema, // disabled — Code Compiler not in use
]);

// Generic update — used for PUT /assignments/:id without strict per-type rules.
export const updateAssignmentSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: z.string().nullable(),
    orderIndex: z.number().int(),
    questions: z.array(mcqQuestionSchema).min(1),
  })
  .partial();

export const mcqSubmitSchema = z.object({
  answers: z.array(z.number().int()),
});

export const mcqCheckSchema = z.object({
  questionIndex: z.number().int().min(0),
  answer: z.number().int().min(0),
});

export const textSubmitSchema = z.object({
  answer: z.string().trim().min(1),
});

export const codeSubmitSchema = z.object({
  language: z.string().trim().min(1),
  code: z.string().min(1),
});

export const reviewSchema = z.object({
  status: z.enum(['passed', 'failed']),
  feedback: z.string().optional(),
});

export type CreateMCQInput = z.infer<typeof createMCQSchema>;
export type CreateTextInput = z.infer<typeof createTextSchema>;
export type CreateCodeInput = z.infer<typeof createCodeSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type McqSubmitInput = z.infer<typeof mcqSubmitSchema>;
export type McqCheckInput = z.infer<typeof mcqCheckSchema>;
export type TextSubmitInput = z.infer<typeof textSubmitSchema>;
export type CodeSubmitInput = z.infer<typeof codeSubmitSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
