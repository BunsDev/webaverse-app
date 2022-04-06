const geometryUtils = (() => {

    let scope = {};

    scope.worker = new Worker('./geometry-utils.worker.js', { type: 'module' });

    scope.worker.onmessage = e => {

        if (e.data.message === 'generateTerrain') {
            scope.resolve({arrays: e.data.arrays, buffers: e.data.buffers });
        } else if (e.data.message === 'deallocateChunk') {
            scope.resolve({ arrays: e.data.arrays });
        } else if (e.data.message === 'generateChunk') {
            scope.resolve({ arrays: e.data.arrays, slots: e.data.slots });
        }
    }

    scope.generateTerrain = async (
        chunkSize, chunkCount, segment, vertexBufferSizeParam, indexBufferSizeParam, arrays
    ) => {

        return new Promise((resolve, reject) => {
            scope.worker.postMessage(
                {
                    message: 'generateTerrain',
                    params: [chunkSize, chunkCount, segment, vertexBufferSizeParam, indexBufferSizeParam],
                    arrays: arrays
                },
                arrays.map(a => a.buffer)
            );

            scope.resolve = resolve;
        });
    }

    scope.deallocateChunk = async (
        vertexSlot, indexSlot, totalChunkCount,
        chunkVertexRangeBuffer, vertexFreeRangeBuffer, chunkIndexRangeBuffer, indexFreeRangeBuffer,
        arrays
    ) => {

        return new Promise((resolve, reject) => {

            try {
                scope.worker.postMessage({
                    message: 'deallocateChunk',
                    params: [
                        vertexSlot, indexSlot, totalChunkCount, chunkVertexRangeBuffer,
                        vertexFreeRangeBuffer, chunkIndexRangeBuffer, indexFreeRangeBuffer
                    ],
                    arrays: arrays
                }, arrays.map(a => a.buffer));
            } catch (e) {
                debugger
            }

            scope.resolve = resolve;
        });
    }

    scope.generateChunk = async (
        positionBuffer, normalBuffer, biomeBuffer, indexBuffer,
        chunkVertexRangeBuffer, vertexFreeRangeBuffer, chunkIndexRangeBuffer, indexFreeRangeBuffer,
        x, y, z, chunkSize, segment, totalChunkCount, arrays
    ) => {

        return new Promise((resolve, reject) => {
            scope.worker.postMessage({
                message: 'generateChunk',
                params: [
                    positionBuffer, normalBuffer, biomeBuffer, indexBuffer,
                    chunkVertexRangeBuffer, vertexFreeRangeBuffer, chunkIndexRangeBuffer, indexFreeRangeBuffer,
                    x, y, z, chunkSize, segment, totalChunkCount,
                ],
                arrays: arrays
            }, arrays.map(a => a.buffer));

            scope.resolve = resolve;
        });
    }

    return scope;

})();

export default geometryUtils;