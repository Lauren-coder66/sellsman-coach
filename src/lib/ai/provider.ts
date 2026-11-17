import type { z } from 'zod';
import { scenarioSchema, reportSchema } from '@/lib/validation';
import type { FocusDimension } from '@/lib/focus';

export type Scenario = z.infer<typeof scenarioSchema>;
export type Report = z.infer<typeof reportSchema>;
export type ConversationMessage = { id: string; role: 'user' | 'customer'; content: string; sequence: number };
export type CustomerProfile = { identity: string; concern: string; stance: number };
export type TrainingFocusContext = { dimension: FocusDimension; instruction: string };
export interface AIProvider {
  generateCustomerProfile(scenario: Scenario, focus?: TrainingFocusContext): Promise<CustomerProfile>;
  generateCustomerOpening(scenario: Scenario, profile: CustomerProfile, focus?: TrainingFocusContext): Promise<string>;
  generateCustomerReply(scenario: Scenario, profile: CustomerProfile, messages: ConversationMessage[], focus?: TrainingFocusContext): Promise<string>;
  generateTrainingReport(scenario: Scenario, messages: ConversationMessage[], focus?: TrainingFocusContext): Promise<Report>;
}
