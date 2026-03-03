declare module "luxon";

declare module "@langchain/langgraph" {
  export const START: string;
  export const END: string;

  export interface AnnotationFactory {
    <T = unknown>(): T;
    Root(schema: Record<string, unknown>): unknown;
  }

  export const Annotation: AnnotationFactory;

  export class StateGraph {
    constructor(state: unknown);
    addNode(name: string, fn: (state: any) => Promise<any>): this;
    addEdge(from: string, to: string): this;
    compile(): {
      invoke(input: any): Promise<any>;
    };
  }
}
