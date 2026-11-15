export type ShadowRootScanResult = { foundNewRoot: boolean; unresolvedHosts: Set<Element> };

export interface DomQueryService {
  query<T>(
    root: Document | ShadowRoot | Element,
    queryString: string,
    treeWalkerFilter: (element: Element) => boolean,
    mutationObserver?: MutationObserver,
    forceDeepQueryAttempt?: boolean,
  ): T[];
  queryWithUnresolvedShadowHosts<T>(
    root: Document | ShadowRoot | Element,
    treeWalkerFilter: (element: Element) => boolean,
    mutationObserver?: MutationObserver,
  ): { elements: T[]; unresolvedHosts: Set<Element> };
  updatePageContainsShadowDom(): boolean;
  /** Skips the document-wide closed-shadow walk until {@link resumeShadowProbe}. */
  suspendShadowProbe(): void;
  /** Runs the shadow walk that {@link suspendShadowProbe} held back. */
  resumeShadowProbe(): void;
  refreshShadowDomStateForUserRequest(): void;
  checkMutationsInShadowRoots(mutations: MutationRecord[]): boolean;
  checkForNewShadowRoots(
    addedElements?: Element[],
    mutationObserver?: MutationObserver,
  ): ShadowRootScanResult;
  setOwnedShadowHostPredicate(predicate: (host: Element) => boolean): void;
  resetObservedShadowRoots(): void;
  purgeDetachedShadowRoots(): void;
  queryDeepSelector(selector: string): Element | null;
  findIframeCrossing(
    selector: string,
  ): { iframeElement: HTMLIFrameElement; innerSelector: string } | null;
}
