import { defineCollection, z } from "astro:content";
import { file } from "astro/loaders";

// Entries are shown in ascending `order`; collections have no inherent order.

const projects = defineCollection({
  loader: file("src/content/projects.yaml"),
  schema: z.object({
    order: z.number(),
    /** Optional badge next to the title, e.g. "In progress". */
    status: z.string().optional(),
    title: z.string(),
    desc: z.array(z.string()),
    links: z.array(z.object({ text: z.string(), url: z.string() })).default([]),
    tech: z.array(z.string()),
  }),
});

export const collections = { projects };
