import { invokeCommand } from '../../Platform/IPC';
import {
  FdtInfo,
  FdtNode,
  FdtProperty,
  ParseFdtResult,
  GetNodeResult,
  GetPropertyResult,
  ListNodeChildrenResult,
  GenerateDtsResult,
} from './Types';

/**
 * Flattened Device Tree (FDT) parser for DTB files.
 *
 * FdtParser provides functionality for loading, parsing, and querying
 * Device Tree Blob (DTB) files used on embedded Linux systems. DTB files
 * contain hardware description including memory layout, CPU configuration,
 * peripherals, and boot parameters.
 *
 * Parsing is performed by the Rust backend for efficiency, with results
 * passed back to TypeScript for UI display and analysis.
 *
 * Example usage:
 * ```typescript
 * const parser = new FdtParser();
 * const info = await parser.loadFromData(dtbBuffer);
 * const root = await parser.getNode('/');
 * const model = root.properties.find(p => p.name === 'model');
 * ```
 */
export class FdtParser {
  /** Raw DTB binary data */
  private _data: Uint8Array | null = null;

  /** Parsed FDT information */
  private _info: FdtInfo | null = null;

  /** Gets the raw DTB binary data */
  get data(): Uint8Array | null {
    return this._data;
  }

  /** Gets the parsed FDT information */
  get info(): FdtInfo | null {
    return this._info;
  }

  /** Checks if DTB data has been loaded */
  get isLoaded(): boolean {
    return this._data !== null && this._info !== null;
  }

  /**
   * Loads and parses DTB from file path.
   *
   * Parses the Device Tree Blob file using Rust backend.
   * Returns parsed info but does not store raw data.
   *
   * @param filePath - Path to DTB file
   * @returns FdtInfo with parsed structure
   * @throws Error if parsing fails
   */
  async loadFromFile(filePath: string): Promise<FdtInfo> {
    const result = (await invokeCommand('fdt_parse_from_file', { filePath })) as ParseFdtResult;

    if (!result.success || !result.fdt_info) {
      throw new Error(result.message);
    }

    this._info = result.fdt_info;
    return this._info;
  }

  /**
   * Loads and parses DTB from binary data.
   *
   * Parses the Device Tree Blob from Uint8Array or number array.
   * Stores raw data for subsequent node/property queries.
   *
   * @param data - DTB binary data
   * @returns FdtInfo with parsed structure
   * @throws Error if parsing fails
   */
  async loadFromData(data: Uint8Array | number[]): Promise<FdtInfo> {
    const dataArray = Array.isArray(data) ? data : Array.from(data);
    const result = (await invokeCommand('fdt_parse_from_data', {
      data: dataArray,
    })) as ParseFdtResult;

    if (!result.success || !result.fdt_info) {
      throw new Error(result.message);
    }

    this._data = new Uint8Array(dataArray);
    this._info = result.fdt_info;
    return this._info;
  }

  /**
   * Clears loaded DTB data and parsed info.
   */
  clear(): void {
    this._data = null;
    this._info = null;
  }

  /**
   * Ensures DTB data is loaded before operations.
   *
   * @throws Error if data not loaded
   * @returns Uint8Array with DTB data
   */
  private ensureData(): Uint8Array {
    if (!this._data) {
      throw new Error('FDT data not loaded. Call loadFromFile or loadFromData first.');
    }
    return this._data;
  }

  /**
   * Gets a node from the device tree by path.
   *
   * @param nodePath - Full path to node (e.g., '/soc/serial')
   * @returns FdtNode with properties and children
   * @throws Error if node not found
   */
  async getNode(nodePath: string): Promise<FdtNode> {
    const data = this.ensureData();
    const result = (await invokeCommand('fdt_get_node', {
      data: Array.from(data),
      nodePath,
    })) as GetNodeResult;

    if (!result.success || !result.node) {
      throw new Error(result.message);
    }

    return result.node;
  }

  /**
   * Gets a property value from a node.
   *
   * @param nodePath - Full path to containing node
   * @param propertyName - Name of property to retrieve
   * @returns FdtProperty with value and raw bytes
   * @throws Error if property not found
   */
  async getProperty(nodePath: string, propertyName: string): Promise<FdtProperty> {
    const data = this.ensureData();
    const result = (await invokeCommand('fdt_get_property', {
      data: Array.from(data),
      nodePath,
      propertyName,
    })) as GetPropertyResult;

    if (!result.success || !result.property) {
      throw new Error(result.message);
    }

    return result.property;
  }

  /**
   * Lists child node names for a parent node.
   *
   * @param nodePath - Full path to parent node
   * @returns Array of child node names
   * @throws Error if node not found
   */
  async listNodeChildren(nodePath: string): Promise<string[]> {
    const data = this.ensureData();
    const result = (await invokeCommand('fdt_list_node_children', {
      data: Array.from(data),
      nodePath,
    })) as ListNodeChildrenResult;

    if (!result.success) {
      throw new Error(result.message);
    }

    return result.children;
  }

  /**
   * Finds all nodes with matching compatible string.
   *
   * Searches device tree for nodes with 'compatible' property
   * matching the specified string.
   *
   * @param compatibleString - Compatible value to search for
   * @returns Array of matching node paths
   * @throws Error if search fails
   */
  async findCompatible(compatibleString: string): Promise<string[]> {
    const data = this.ensureData();
    const result = (await invokeCommand('fdt_find_compatible', {
      data: Array.from(data),
      compatibleString,
    })) as ListNodeChildrenResult;

    if (!result.success) {
      throw new Error(result.message);
    }

    return result.children;
  }

  /**
   * Generates DTS source from DTB data.
   *
   * Converts the binary DTB format to human-readable DTS text
   * for debugging and analysis.
   *
   * @returns DTS source code string
   * @throws Error if generation fails
   */
  async generateDts(): Promise<string> {
    const data = this.ensureData();
    const result = (await invokeCommand('fdt_generate_dts', {
      data: Array.from(data),
    })) as GenerateDtsResult;

    if (!result.success || !result.dts) {
      throw new Error(result.message);
    }

    return result.dts;
  }
}

/**
 * Parses DTB from file without storing data.
 *
 * Convenience function for one-time parsing.
 *
 * @param filePath - Path to DTB file
 * @returns FdtInfo with parsed structure
 */
export async function parseFdtFromFile(filePath: string): Promise<FdtInfo> {
  const parser = new FdtParser();
  return parser.loadFromFile(filePath);
}

/**
 * Parses DTB from binary data without persisting parser.
 *
 * Convenience function for one-time parsing.
 *
 * @param data - DTB binary data
 * @returns FdtInfo with parsed structure
 */
export async function parseFdtFromData(data: Uint8Array | number[]): Promise<FdtInfo> {
  const parser = new FdtParser();
  return parser.loadFromData(data);
}

/**
 * Gets a node from DTB data without creating parser instance.
 *
 * Convenience function for one-time node lookup.
 *
 * @param data - DTB binary data
 * @param nodePath - Full path to node
 * @returns FdtNode with properties and children
 */
export async function getFdtNode(data: Uint8Array | number[], nodePath: string): Promise<FdtNode> {
  const dataArray = Array.isArray(data) ? data : Array.from(data);
  const result = (await invokeCommand('fdt_get_node', {
    data: dataArray,
    nodePath,
  })) as GetNodeResult;

  if (!result.success || !result.node) {
    throw new Error(result.message);
  }

  return result.node;
}

/**
 * Gets a property from DTB data without creating parser instance.
 *
 * Convenience function for one-time property lookup.
 *
 * @param data - DTB binary data
 * @param nodePath - Full path to containing node
 * @param propertyName - Name of property to retrieve
 * @returns FdtProperty with value and raw bytes
 */
export async function getFdtProperty(
  data: Uint8Array | number[],
  nodePath: string,
  propertyName: string
): Promise<FdtProperty> {
  const dataArray = Array.isArray(data) ? data : Array.from(data);
  const result = (await invokeCommand('fdt_get_property', {
    data: dataArray,
    nodePath,
    propertyName,
  })) as GetPropertyResult;

  if (!result.success || !result.property) {
    throw new Error(result.message);
  }

  return result.property;
}

/**
 * Lists child nodes from DTB data without creating parser instance.
 *
 * Convenience function for one-time child listing.
 *
 * @param data - DTB binary data
 * @param nodePath - Full path to parent node
 * @returns Array of child node names
 */
export async function listFdtNodeChildren(
  data: Uint8Array | number[],
  nodePath: string
): Promise<string[]> {
  const dataArray = Array.isArray(data) ? data : Array.from(data);
  const result = (await invokeCommand('fdt_list_node_children', {
    data: dataArray,
    nodePath,
  })) as ListNodeChildrenResult;

  if (!result.success) {
    throw new Error(result.message);
  }

  return result.children;
}

/**
 * Finds nodes by compatible string without creating parser instance.
 *
 * Convenience function for one-time compatible search.
 *
 * @param data - DTB binary data
 * @param compatibleString - Compatible value to search for
 * @returns Array of matching node paths
 */
export async function findFdtCompatible(
  data: Uint8Array | number[],
  compatibleString: string
): Promise<string[]> {
  const dataArray = Array.isArray(data) ? data : Array.from(data);
  const result = (await invokeCommand('fdt_find_compatible', {
    data: dataArray,
    compatibleString,
  })) as ListNodeChildrenResult;

  if (!result.success) {
    throw new Error(result.message);
  }

  return result.children;
}

/**
 * Generates DTS source from DTB data without creating parser instance.
 *
 * Convenience function for one-time DTS generation.
 *
 * @param data - DTB binary data
 * @returns DTS source code string
 */
export async function generateFdtDts(data: Uint8Array | number[]): Promise<string> {
  const dataArray = Array.isArray(data) ? data : Array.from(data);
  const result = (await invokeCommand('fdt_generate_dts', {
    data: dataArray,
  })) as GenerateDtsResult;

  if (!result.success || !result.dts) {
    throw new Error(result.message);
  }

  return result.dts;
}