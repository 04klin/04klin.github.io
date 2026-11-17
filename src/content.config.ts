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
    /** A few words on where it came from, e.g. "Coursework". */
    context: z.string().optional(),
    /** A sentence or two on what makes it interesting. */
    about: z.string().optional(),
    links: z.array(z.object({ text: z.string(), url: z.string() })).default([]),
    tech: z.array(z.string()),
  }),
});

export const collections = { projects };
