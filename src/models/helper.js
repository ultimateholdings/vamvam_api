/*jslint node this*/
const {Op} = require("sequelize");

const defaultResponse = {
    with(opts) {
        const result = this;
        if (typeof opts === "object") {
            Object.entries(opts).forEach(function ([key, value]) {
                result[key] = value;
            });
        }
        return result;
    }
};

const stringName = (val) => (
    typeof val === "string"
    ? val
    : undefined

);
function paginationQuery(offset, maxSize) {
    let query = {};
    if (offset > 0) {
        query.limit = maxSize + 1;
        query.offset = offset - 1;
    } else {
        query.limit = maxSize;
        query.offset = offset;
    }
    return query;
}

/**this function purpose is to avoid jslint complaining about
 * usage of inline symbols in objects
 * such as {[Symbol]: value}
 *  */
function buildClause(operator, value) {
    const result = {};
    result[operator] = value;
    return result;
}

function join(model, joinName, inner = true) {
    const result = {}
    const as = stringName(joinName);
    Object.assign(result, defaultResponse);
    return result.with({as, model, required: inner});
}

function constraints(foreignKey, name, rigid = false) {
    const result = {foreignKey};
    const as = stringName(name);
    Object.assign(result, defaultResponse);
    return result.with({as, constraints: rigid});
}

function buildPeriodQuery(from, to) {
    const result = [];
    const begin = Date.parse(from);
    const end = Date.parse(to);
    if (Number.isFinite(begin)) {
        result = result.concat(
            {createdAt: buildClause(Op.gte, new Date(begin))}
        );
    }
    if (Number.isFinite(Date.parse(to))) {
        result = result.concat(
            {createdAt: buildClause(Op.lte, new Date(end))}
        );
    }
    return result;
}

module.exports = Object.freeze({
    buildClause,
    buildPeriodQuery,
    constraints,
    join,
    paginationQuery
});