import { Construct, IConstruct, IDependable, Stack } from "@aws-cdk/cdk";
import { subnetName } from './util';

export interface IVpcSubnet extends IConstruct, IDependable {
  /**
   * The Availability Zone the subnet is located in
   */
  readonly availabilityZone: string;

  /**
   * The subnetId for this particular subnet
   */
  readonly subnetId: string;

  /**
   * Exports this subnet to another stack.
   */
  export(): VpcSubnetImportProps;
}

export interface IVpcNetwork extends IConstruct, IDependable {
  /**
   * Identifier for this VPC
   */
  readonly vpcId: string;

  /**
   * List of public subnets in this VPC
   */
  readonly publicSubnets: IVpcSubnet[];

  /**
   * List of private subnets in this VPC
   */
  readonly privateSubnets: IVpcSubnet[];

  /**
   * List of isolated subnets in this VPC
   */
  readonly isolatedSubnets: IVpcSubnet[];

  /**
   * AZs for this VPC
   */
  readonly availabilityZones: string[];

  /**
   * Region where this VPC is located
   */
  readonly vpcRegion: string;

  /**
   * Take a dependency on internet connectivity having been added to this VPC
   *
   * Take a dependency on this if your constructs need an Internet Gateway
   * added to the VPC before they can be constructed.
   *
   * This method is for construct authors; application builders should not
   * need to call this.
   */
  internetDependency(): IDependable;

  /**
   * Return the subnets appropriate for the placement strategy
   */
  subnets(placement?: VpcPlacementStrategy, required?: SubnetQuery): IVpcSubnet[];

  /**
   * Return whether the given subnet is one of this VPC's public subnets.
   *
   * The subnet must literally be one of the subnet object obtained from
   * this VPC. A subnet that merely represents the same subnet will
   * never return true.
   */
  isPublicSubnet(subnet: IVpcSubnet): boolean;

  /**
   * Exports this VPC so it can be consumed by another stack.
   */
  export(): VpcNetworkImportProps;
}

/**
 * The type of Subnet
 */
export enum SubnetType {
  /**
   * Isolated Subnets do not route Outbound traffic
   *
   * This can be good for subnets with RDS or
   * Elasticache endpoints
   */
  Isolated = 'Isolated',

  /**
   * Subnet that routes to the internet, but not vice versa.
   *
   * Instances in a private subnet can connect to the Internet, but will not
   * allow connections to be initiated from the Internet.
   *
   * Outbound traffic will be routed via a NAT Gateway. Preference being in
   * the same AZ, but if not available will use another AZ (control by
   * specifing `maxGateways` on VpcNetwork). This might be used for
   * experimental cost conscious accounts or accounts where HA outbound
   * traffic is not needed.
   */
  Private = 'Private',

  /**
   * Subnet connected to the Internet
   *
   * Instances in a Public subnet can connect to the Internet and can be
   * connected to from the Internet as long as they are launched with public
   * IPs (controlled on the AutoScalingGroup or other constructs that launch
   * instances).
   *
   * Public subnets route outbound traffic via an Internet Gateway.
   */
  Public = 'Public'
}

/**
 * Customize how instances are placed inside a VPC
 *
 * Constructs that allow customization of VPC placement use parameters of this
 * type to provide placement settings.
 *
 * By default, the instances are placed in the private subnets.
 */
export interface VpcPlacementStrategy {
  /**
   * Place the instances in the subnets of the given type
   *
   * At most one of `subnetsToUse` and `subnetName` can be supplied.
   *
   * @default SubnetType.Private
   */
  subnetsToUse?: SubnetType;

  /**
   * Place the instances in the subnets with the given name
   *
   * (This is the name supplied in subnetConfiguration).
   *
   * At most one of `subnetsToUse` and `subnetName` can be supplied.
   *
   * @default name
   */
  subnetName?: string;
}

/**
 * A new or imported VPC
 */
export abstract class VpcNetworkBase extends Construct implements IVpcNetwork {

  /**
   * Identifier for this VPC
   */
  public abstract readonly vpcId: string;

  /**
   * List of public subnets in this VPC
   */
  public abstract readonly publicSubnets: IVpcSubnet[];

  /**
   * List of private subnets in this VPC
   */
  public abstract readonly privateSubnets: IVpcSubnet[];

  /**
   * List of isolated subnets in this VPC
   */
  public abstract readonly isolatedSubnets: IVpcSubnet[];

  /**
   * AZs for this VPC
   */
  public abstract readonly availabilityZones: string[];

  /**
   * Parts of the VPC that constitute full construction
   */
  public readonly dependencyElements: IDependable[] = [];

  /**
   * Dependencies for internet connectivity
   */
  public readonly internetDependencies = new Array<IDependable>();

  /**
   * Return the subnets appropriate for the placement strategy
   */
  public subnets(placement: VpcPlacementStrategy = {}, required = SubnetQuery.Required): IVpcSubnet[] {
    if (placement.subnetsToUse !== undefined && placement.subnetName !== undefined) {
      throw new Error('At most one of subnetsToUse and subnetName can be supplied');
    }

    // Select by name
    if (placement.subnetName !== undefined) {
      const allSubnets = this.privateSubnets.concat(this.publicSubnets).concat(this.isolatedSubnets);
      const selectedSubnets = allSubnets.filter(s => subnetName(s) === placement.subnetName);
      if (selectedSubnets.length === 0) {
        throw new Error(`No subnets with name: ${placement.subnetName}`);
      }
      return selectedSubnets;
    }

    // Select by type
    if (placement.subnetsToUse === undefined) { return this.privateSubnets; }

    const selected = {
      [SubnetType.Isolated]: this.isolatedSubnets,
      [SubnetType.Private]: this.privateSubnets,
      [SubnetType.Public]: this.publicSubnets,
    }[placement.subnetsToUse];

    if (required === SubnetQuery.Required && selected.length === 0) {
      throw new Error(`No subnets in this VPC match ${JSON.stringify(placement)}. Please select a different set of subnets.`);
    }

    return selected;
  }

  /**
   * Export this VPC from the stack
   */
  public abstract export(): VpcNetworkImportProps;

  /**
   * Return whether the given subnet is one of this VPC's public subnets.
   *
   * The subnet must literally be one of the subnet object obtained from
   * this VPC. A subnet that merely represents the same subnet will
   * never return true.
   */
  public isPublicSubnet(subnet: IVpcSubnet) {
    return this.publicSubnets.indexOf(subnet) > -1;
  }

  /**
   * Take a dependency on internet connectivity having been added to this VPC
   *
   * Take a dependency on this if your constructs need an Internet Gateway
   * added to the VPC before they can be constructed.
   *
   * This method is for construct authors; application builders should not
   * need to call this.
   */
  public internetDependency(): IDependable {
    return new DependencyList(this.internetDependencies);
  }

  /**
   * The region where this VPC is defined
   */
  public get vpcRegion(): string {
    return Stack.find(this).region;
  }

}

/**
 * Properties that reference an external VpcNetwork
 */
export interface VpcNetworkImportProps {
  /**
   * VPC's identifier
   */
  vpcId: string;

  /**
   * List of availability zones for the subnets in this VPC.
   */
  availabilityZones: string[];

  /**
   * List of public subnet IDs
   *
   * Must be undefined or match the availability zones in length and order.
   */
  publicSubnetIds?: string[];

  /**
   * List of names for the public subnets
   *
   * Must be undefined or have a name for every public subnet group.
   */
  publicSubnetNames?: string[];

  /**
   * List of private subnet IDs
   *
   * Must be undefined or match the availability zones in length and order.
   */
  privateSubnetIds?: string[];

  /**
   * List of names for the private subnets
   *
   * Must be undefined or have a name for every private subnet group.
   */
  privateSubnetNames?: string[];

  /**
   * List of isolated subnet IDs
   *
   * Must be undefined or match the availability zones in length and order.
   */
  isolatedSubnetIds?: string[];

  /**
   * List of names for the isolated subnets
   *
   * Must be undefined or have a name for every isolated subnet group.
   */
  isolatedSubnetNames?: string[];
}

export interface VpcSubnetImportProps {
  /**
   * The Availability Zone the subnet is located in
   */
  availabilityZone: string;

  /**
   * The subnetId for this particular subnet
   */
  subnetId: string;
}

/**
 * Allows using an array as a list of dependables.
 */
class DependencyList implements IDependable {
  constructor(private readonly dependenclyElements: IDependable[]) {
  }

  public get dependencyElements(): IDependable[] {
    return this.dependenclyElements;
  }
}

/**
 * Options for querying subnets
 */
export enum SubnetQuery {
  /**
   * Require at least one subnet
   */
  Required = 'Required',

  /**
   * Allow a subnet query to match no subnets
   */
  AllowNone = 'AllowNone'
}