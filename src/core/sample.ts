/** The diagram shown on a fresh install, before any draft exists. */
export const SAMPLE_DIAGRAM = `flowchart TD
    A([Idea]) --> B{¿Vale la pena?}
    B -- Sí --> C[Diseñar el diagrama]
    B -- No --> D([Descartar])
    C --> E{{Mermaid}}
    E --> F[Exportar PNG · SVG · PDF]
    F --> G([Listo para compartir])
    D --> G
`;
