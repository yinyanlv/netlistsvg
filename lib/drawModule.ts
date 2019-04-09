import { ElkModel } from './elkGraph';
import { FlatModule, removeDups } from './FlatModule';
import Cell from './Cell';
import Skin from './Skin';

import _ = require('lodash');
import onml = require('onml');
import assert = require('assert');

enum WireDirection {
    Up, Down, Left, Right,
}

export default function drawModule(g: ElkModel.Graph, module: FlatModule) {
    const nodes = module.getNodes().map((n: Cell) => {
        const kchild: ElkModel.Cell = _.find(g.children, (c) => c.id === n.Key);
        return n.render(kchild);
    });
    removeDummyEdges(g);
    const lines = _.flatMap(g.edges, (e: ElkModel.Edge) => {
        return _.flatMap(e.sections, (s: ElkModel.Section) => {
            let startPoint = s.startPoint;
            s.bendPoints = s.bendPoints || [];
            let bends: any[] = s.bendPoints.map((b) => {
                const l = ['line', {
                    x1: startPoint.x,
                    x2: b.x,
                    y1: startPoint.y,
                    y2: b.y,
                }];
                startPoint = b;
                return l;
            });
            if (e.junctionPoints) {
                const circles: any[] = e.junctionPoints.map((j: ElkModel.WirePoint) =>
                    ['circle', {
                        cx: j.x,
                        cy: j.y,
                        r: 2,
                        style: 'fill:#000',
                    }]);
                bends = bends.concat(circles);
            }
            const line = [['line', {
                x1: startPoint.x,
                x2: s.endPoint.x,
                y1: startPoint.y,
                y2: s.endPoint.y,
            }]];
            return bends.concat(line);
        });
    });
    const svg = Skin.skin.slice(0, 2);
    svg[1].width = g.width;
    svg[1].height = g.height;

    const styles = _.filter(Skin.skin, (el) => {
        return el[0] === 'style';
    });
    const ret = svg.concat(styles).concat(nodes).concat(lines);
    return onml.s(ret);
}

function which_dir(start: ElkModel.WirePoint, end: ElkModel.WirePoint): WireDirection {
    if (end.x === start.x && end.y === start.y) {
        throw new Error('start and end are the same');
    }
    if (end.x !== start.x && end.y !== start.y) {
        throw new Error('start and end arent orthogonal');
    }
    if (end.x > start.x) {
        return WireDirection.Right;
    }
    if (end.x < start.x) {
        return WireDirection.Left;
    }
    if (end.y > start.y) {
        return WireDirection.Down;
    }
    if (end.y < start.y) {
        return WireDirection.Up;
    }
    throw new Error('unexpected direction');
}

function findBendNearDummy(
        net: ElkModel.Edge[],
        dummyIsSource: boolean,
        dummyLoc: ElkModel.WirePoint): ElkModel.WirePoint {
    const candidates = net.map( (edge) => {
        const bends = edge.sections[0].bendPoints || [null];
        if (dummyIsSource) {
            return _.first(bends);
        } else {
            return _.last(bends);
        }
    }).filter((p) => p !== null);
    return _.minBy(candidates, (pt: ElkModel.WirePoint) => {
        return Math.abs(dummyLoc.x - pt.x) + Math.abs(dummyLoc.y - pt.y);
    });
}

export function removeDummyEdges(g: ElkModel.Graph) {
    // go through each edge group for each dummy
    let dummyNum: number = 0;
    // loop until we can't find an edge group or we hit 10,000
    while (dummyNum < 10000) {
        const dummyId: string = '$d_' + String(dummyNum);
        // find all edges connected to this dummy
        const edgeGroup = _.filter(g.edges, (e) => {
            return e.source === dummyId || e.target === dummyId;
        });
        if (edgeGroup.length === 0) {
            break;
        }
        let dummyIsSource: boolean;
        let dummyLoc: ElkModel.WirePoint;
        if (edgeGroup[0].source === dummyId) {
            dummyIsSource = true;
            dummyLoc = edgeGroup[0].sections[0].startPoint;
        } else {
            dummyIsSource = false;
            dummyLoc = edgeGroup[0].sections[0].endPoint;
        }
        const newEnd: ElkModel.WirePoint = findBendNearDummy(edgeGroup, dummyIsSource, dummyLoc);
        for (const edge of edgeGroup) {
            const section = edge.sections[0];
            if (dummyIsSource) {
                section.startPoint = newEnd;
                if (section.bendPoints) {
                    section.bendPoints.shift();
                }
            } else {
                section.endPoint = newEnd;
                if (section.bendPoints) {
                    section.bendPoints.pop();
                }
            }
        }
        dummyNum += 1;
    }
}
