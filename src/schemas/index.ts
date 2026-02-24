import { z } from 'zod';

// === Building ===
export const CreateBuildingSchema = z.object({
  name: z.string().min(1),
  firstDate: z.coerce.date(),
});
export type CreateBuildingInput = z.infer<typeof CreateBuildingSchema>;

// === Typology (Place) ===
export const CreateUnitSchema = z.object({
  name: z.string().min(1),
});
export type CreateUnitInput = z.infer<typeof CreateUnitSchema>;

export const CreateLocalSchema = z.object({
  name: z.string().min(1),
  parentId: z.string(),
});
export type CreateLocalInput = z.infer<typeof CreateLocalSchema>;

export const RenamePlaceSchema = z.object({
  name: z.string().min(1),
});
export type RenamePlaceInput = z.infer<typeof RenamePlaceSchema>;

// === Diagram ===
export const CreateDiagramSchema = z.object({
  name: z.string().min(1),
});
export type CreateDiagramInput = z.infer<typeof CreateDiagramSchema>;

// === Network ===
export const CreateNetworkSchema = z.object({
  name: z.string().min(1),
});
export type CreateNetworkInput = z.infer<typeof CreateNetworkSchema>;

export const CreateStageSchema = z.object({
  name: z.string().min(1),
  duration: z.number().positive(),
  latency: z.number().min(0).default(0),
});
export type CreateStageInput = z.infer<typeof CreateStageSchema>;

export const AddPrecedenceSchema = z.object({
  sourceStageId: z.string(),
  destinationStageId: z.string(),
  opening: z.number().default(0),
  latency: z.number().default(0),
});
export type AddPrecedenceInput = z.infer<typeof AddPrecedenceSchema>;
