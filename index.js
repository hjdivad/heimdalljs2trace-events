/* jshint loopfunc:true */

var fs = require('fs');

function loadTree(path) {
  const tree = toTree(JSON.parse(fs.readFileSync(path, 'UTF8')));

  return tree;
}


function toTree(data) {
  let nodes = data.nodes.map(function(a) {
    return new Node(a._id, a.id, a.stats, a.children, a.startTime, a.endTime);
  });

  nodes.forEach(function(node) {
    node.children = node.children.map(function(id) {
      return nodes[id];
    });
  });

  return nodes[0];
}


function Node(_id, id, stats, children, startTime, endTime) {
  this._id = _id;
  this.id = id;
  this.stats = stats;
  this.children = children;
  this.startTime = startTime;
  this.endTime = endTime;
}

Node.prototype.preOrderIterator = function* () {
  yield this;

  for(let child of this.children) {
    for(let descendant of child.preOrderIterator()) {
      yield descendant;
    }
  }
};


Node.prototype.findDescendant = function(matcher) {
  for (const node of this.preOrderIterator()) {
    if(matcher(node.id)) {
      return node;
    }
  }
};


let [pid, tid] = [52101, 1295];

let traceEventsData = JSON.parse(fs.readFileSync('trace_trace-events.json'), 'UTF8');
let navigationStartTE = traceEventsData.traceEvents.find(te => te.name === 'navigationStart' && te.pid === pid && te.tid === tid);
let navigationStart = navigationStartTE.ts;
let root = loadTree('heimdall.json');


let asyncId = "0xffc4756f8809ac17";

for (let node of root.preOrderIterator()) {
  if (node.id.name === 'heimdall') {
    // skip root node
    continue;
  }

  let timestamp = Math.floor(node.startTime / 1e3) + navigationStart;
  let duration = Math.floor((node.endTime - node.startTime) / 1e3);
  let stats = node.stats;
  delete node.stats.own;
  delete node.stats.time;

  let isAsync = node.id.name === 'pre-transition' || node.id.name === 'transition' || node.id.name === 'post-transition';
  let heimdallTraceEvents = [];

  if (isAsync) {
    traceEventsData.traceEvents.push({
      pid: pid,
      tid: tid,
      ts: timestamp,
      ph: 'b',
      name: node.id.name,
      cat: 'blink.user_timing',
      id: asyncId,
      args: {
        label: node.id,
        stats: stats,
      },
    });

    traceEventsData.traceEvents.push({
      pid: pid,
      tid: tid,
      ts: timestamp + duration,
      ph: 'e',
      name: node.id.name,
      cat: 'blink.user_timing',
      id: asyncId,
      args: {},
    });
  } else {
    traceEventsData.traceEvents.push({
      pid: pid,
      tid: tid,
      ts: timestamp,
      ph: 'X',
      name: node.id.name,
      cat: 'heimdall',
      args: {
        label: node.id,
        stats: stats,
      },

      dur: duration,
    });
  }
}

fs.writeFileSync('merged.json', JSON.stringify(traceEventsData, null, 2));
