declare module 'd3-force-3d' {
  export interface SimulationNodeDatum {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  export interface SimulationLinkDatum<NodeDatum extends SimulationNodeDatum> {
    source: NodeDatum | string | number;
    target: NodeDatum | string | number;
    index?: number;
  }

  export interface Force<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum> | undefined> {
    (alpha: number): void;
    initialize?(nodes: NodeDatum[], random: () => number): void;
  }

  export interface Simulation3D<
    NodeDatum extends SimulationNodeDatum,
    LinkDatum extends SimulationLinkDatum<NodeDatum> | undefined
  > {
    restart(): this;
    stop(): this;
    tick(iterations?: number): this;
    nodes(): NodeDatum[];
    nodes(nodes: NodeDatum[]): this;
    alpha(): number;
    alpha(alpha: number): this;
    alphaMin(): number;
    alphaMin(min: number): this;
    alphaDecay(): number;
    alphaDecay(decay: number): this;
    alphaTarget(): number;
    alphaTarget(target: number): this;
    velocityDecay(): number;
    velocityDecay(decay: number): this;
    force(name: string): Force<NodeDatum, LinkDatum> | undefined;
    force(name: string, force: null): this;
    force(name: string, force: Force<NodeDatum, LinkDatum>): this;
    find(x: number, y: number, z?: number, radius?: number): NodeDatum | undefined;
    randomSource(): () => number;
    randomSource(source: () => number): this;
    numDimensions(): number;
    numDimensions(dims: number): this;
    on(typenames: string): ((this: Simulation3D<NodeDatum, LinkDatum>) => void) | undefined;
    on(typenames: string, listener: null): this;
    on(typenames: string, listener: (this: Simulation3D<NodeDatum, LinkDatum>) => void): this;
  }

  export interface ForceLink3D<
    NodeDatum extends SimulationNodeDatum,
    LinkDatum extends SimulationLinkDatum<NodeDatum>
  > extends Force<NodeDatum, LinkDatum> {
    links(): LinkDatum[];
    links(links: LinkDatum[]): this;
    id(): (node: NodeDatum, i: number, nodesData: NodeDatum[]) => string | number;
    id(id: (node: NodeDatum, i: number, nodesData: NodeDatum[]) => string | number): this;
    distance(): number | ((link: LinkDatum, i: number, links: LinkDatum[]) => number);
    distance(distance: number | ((link: LinkDatum, i: number, links: LinkDatum[]) => number)): this;
    strength(): number | ((link: LinkDatum, i: number, links: LinkDatum[]) => number);
    strength(strength: number | ((link: LinkDatum, i: number, links: LinkDatum[]) => number)): this;
    iterations(): number;
    iterations(iterations: number): this;
  }

  export interface ForceManyBody<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, undefined> {
    strength(): number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number);
    strength(strength: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): this;
    theta(): number;
    theta(theta: number): this;
    distanceMin(): number;
    distanceMin(distance: number): this;
    distanceMax(): number;
    distanceMax(distance: number): this;
  }

  export interface ForceCenter<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, undefined> {
    x(): number;
    x(x: number): this;
    y(): number;
    y(y: number): this;
    z(): number;
    z(z: number): this;
    strength(): number;
    strength(strength: number): this;
  }

  export interface ForceX<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, undefined> {
    strength(): number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number);
    strength(strength: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): this;
    x(): number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number);
    x(x: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): this;
  }

  export interface ForceY<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, undefined> {
    strength(): number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number);
    strength(strength: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): this;
    y(): number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number);
    y(y: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): this;
  }

  export interface ForceZ<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, undefined> {
    strength(): number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number);
    strength(strength: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): this;
    z(): number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number);
    z(z: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): this;
  }

  export function forceSimulation<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum> | undefined = undefined>(
    nodes?: NodeDatum[]
  ): Simulation3D<NodeDatum, LinkDatum>;

  export function forceLink<
    NodeDatum extends SimulationNodeDatum,
    LinkDatum extends SimulationLinkDatum<NodeDatum>
  >(links?: LinkDatum[]): ForceLink3D<NodeDatum, LinkDatum>;

  export function forceManyBody<NodeDatum extends SimulationNodeDatum>(): ForceManyBody<NodeDatum>;

  export function forceCenter<NodeDatum extends SimulationNodeDatum>(x?: number, y?: number, z?: number): ForceCenter<NodeDatum>;

  export function forceX<NodeDatum extends SimulationNodeDatum>(x?: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): ForceX<NodeDatum>;

  export function forceY<NodeDatum extends SimulationNodeDatum>(y?: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): ForceY<NodeDatum>;

  export function forceZ<NodeDatum extends SimulationNodeDatum>(z?: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): ForceZ<NodeDatum>;

  export function forceCollide<NodeDatum extends SimulationNodeDatum>(radius?: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): Force<NodeDatum, undefined>;

  export function forceRadial<NodeDatum extends SimulationNodeDatum>(radius: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number), x?: number, y?: number): Force<NodeDatum, undefined>;
}
