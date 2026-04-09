import { tool } from "@openai/agents";
import z from "zod";

export const currentTimeTool = tool(
    {
        name: "currentTime",
        description: "Get the current time in a specified timezone. If no timezone is provided, return the current time in UTC.",
        parameters: z.object({
            timezone: z.string().optional().describe("The IANA timezone name, e.g., 'America/New_York'."),
        }),
        async execute({ timezone }: { timezone?: string }) {
            const now = new Date();
            if (timezone) {
                try {
                    const timeString = now.toLocaleString("en-US", { timeZone: timezone });
                    return `Current time in ${timezone} is ${timeString}`;
                } catch (error) {
                    return `Invalid timezone: ${timezone}`;
                }
            } else {
                return `Current time in UTC is ${now.toISOString()}`;
            }
        }
    }
);