// Using 1d array for matrix

function mul_mtx(A, rowsA, colsA, B, rowsB, colsB) {
    if (colsA !== rowsB) {
        throw new Error("Incompatible matrix dimensions for multiplication");
    }

    const result = new Float32Array(rowsA * colsB);
    for (let i = 0; i < rowsA; i++) {
        for (let j = 0; j < colsB; j++) {
            let sum = 0;
            for (let k = 0; k < colsA; k++) {
                sum += A[i * colsA + k] * B[k * colsB + j];
            }
            result[i * colsB + j] = sum;
        }
    }    
    return result;
}

function inv_mtx2x2(A) {
    const det = A[0 * 2 + 0] * A[1 * 2 + 1] - A[0 * 2 + 1] * A[1 * 2 + 0];
    if (det === 0) {
        throw new Error("Matrix is singular and cannot be inverted");
    }
    const invDet = 1 / det;
    return [
        [ A[1 * 2 + 1] * invDet, -A[0 * 2 + 1] * invDet],
        [-A[1 * 2 + 0] * invDet,  A[0 * 2 + 0] * invDet]
    ];
}

function transpose_mtx(A, rows, cols) {
    const result = new Float32Array(rows * cols);
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            result[j * rows + i] = A[i * cols + j];
        }
    }
    return result;
}

function add_mtx(A, rowsA, colsA, B, rowsB, colsB) {
    if (rowsA !== rowsB || colsA !== colsB) {   
        throw new Error("Incompatible matrix dimensions for addition");
    }

    const result = new Float32Array(rowsA * colsA);
    for (let i = 0; i < rowsA; i++) {
        for (let j = 0; j < colsA; j++) {
            result[i * colsA + j] = A[i * colsA + j] + B[i * colsB + j];
        }
    }
    return result;
}

module.exports = {
    mul_mtx,
    inv_mtx2x2,
    transpose_mtx,
    add_mtx
};