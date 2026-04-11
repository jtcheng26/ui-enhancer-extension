import { ClientAIProvider } from "@/ai/providers/client-ai-provider";
import { AugmentationRequest } from "@/types";

export const commandHandler = () => ({
  submit: (payload: AugmentationRequest) => {
    const ai = new ClientAIProvider(import.meta.env.WXT_OPENAI_API_KEY);
    const spec = ai.generateExtractor(payload);
    return spec;
  },
});
