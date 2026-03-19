/**
 * Unified DigitalOcean client
 */

export { DOApiError, assertDOId, doRequest } from "./base.js";
export { DODropletsClient } from "./droplets.js";
export type {
  Droplet,
  DropletSize,
  DropletImage,
  DropletRegion,
  DropletNetworks,
  DropletNetworkV4,
  DropletNetworkV6,
  CreateDropletRequest,
  DropletAction,
  Action,
} from "./droplets.js";

export { DOProjectsClient } from "./projects.js";
export type { Project, ProjectResource } from "./projects.js";

import { DODropletsClient } from "./droplets.js";
import { DOProjectsClient } from "./projects.js";

export class DOClient {
  public droplets: DODropletsClient;
  public projects: DOProjectsClient;

  /**
   * @param opts.token - DigitalOcean API token
   * @param opts.projectId - Project ID to auto-assign created droplets to.
   *   If omitted, droplets are not auto-assigned to any project.
   *   Use {@link DOClient.withDefaultProject} to resolve and use the default project.
   */
  constructor(opts: { token: string; projectId?: string }) {
    this.droplets = new DODropletsClient(opts);
    this.projects = new DOProjectsClient(opts);
  }

  /**
   * Create a DOClient that auto-assigns created droplets to the
   * account's default project. Makes one API call to resolve the default.
   */
  static async withDefaultProject(opts: { token: string }): Promise<DOClient> {
    const projects = new DOProjectsClient(opts);
    const defaultProject = await projects.getDefault();
    console.log(
      `[do] Using default project "${defaultProject.name}" (${defaultProject.id})`,
    );
    return new DOClient({ token: opts.token, projectId: defaultProject.id });
  }
}
