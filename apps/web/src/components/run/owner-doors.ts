/** Where a contract's collector door goes in `RunOwners`' `doors`. */
export const collectorDoorKey = (contractCode: string) => `${contractCode}-collector`

/** Where a deal's Presales door goes: the lane's first row, or its empty seat. */
export const presalesDoorKey = (dealCode: string) => `${dealCode}-presales`
