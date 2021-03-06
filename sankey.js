define(["d3.v2.min.js"],function(d3){
    d3.sankey = function() {
      var sankey = {},
          nodeWidth = 24,
          nodePadding = 8,
          size = [1, 1],
          nodes = [],
          links = [];

      sankey.nodeWidth = function(_) {
        if (!arguments.length) return nodeWidth;
        nodeWidth = +_;
        return sankey;
      };

      sankey.nodePadding = function(_) {
        if (!arguments.length) return nodePadding;
        nodePadding = +_;
        return sankey;
      };

      sankey.nodes = function(_) {
        if (!arguments.length) return nodes;
        nodes = _;
        return sankey;
      };

      sankey.links = function(_) {
        if (!arguments.length) return links;
        links = _;
        return sankey;
      };

      sankey.size = function(_) {
        if (!arguments.length) return size;
        size = _;
        return sankey;
      };

      sankey.layout = function(iterations,w,h) {
        computeNodeLinks();
        computeNodeValues();
        computeNodeBreadths(w,h);
        computeNodeDepths(iterations);
        computeLinkDepths();
        return sankey;
      };

      sankey.relayout = function() {
        computeLinkDepths();
        return sankey;
      };

      sankey.link = function() {
        var curvature = .5;

        function link(d) {
          var x0 = d.source.x + d.source.dx,
              x1 = d.target.x,
              xi = d3.interpolateNumber(x0, x1),
              x2 = xi(curvature),
              x3 = xi(1 - curvature),
              y0 = d.source.y + d.sy + d.dy / 2,
              y1 = d.target.y + d.ty + d.dy / 2;
          return "M" + x0 + "," + y0
               + "C" + x2 + "," + y0
               + " " + x3 + "," + y1
               + " " + x1 + "," + y1;
        }

        link.curvature = function(_) {
          if (!arguments.length) return curvature;
          curvature = +_;
          return link;
        };

        return link;
      };

      // Populate the sourceLinks and targetLinks for each node.
      // Also, if the source and target are not objects, assume they are indices.
      function computeNodeLinks() {
        nodes.forEach(function(node) {
          node.sourceLinks = [];
          node.targetLinks = [];
        });
        links.forEach(function(link) {
          var source = link.source,
              target = link.target;
          if (typeof source === "number") source = link.source = nodes[link.source];
          if (typeof target === "number") target = link.target = nodes[link.target];
          source.sourceLinks.push(link);
          target.targetLinks.push(link);
        });
      }

      // Compute the value (size) of each node by summing the associated links.
      function computeNodeValues() {
        nodes.forEach(function(node) {
          node.value = Math.max(
            d3.sum(node.sourceLinks, value),
            d3.sum(node.targetLinks, value)
          );
        });
      }

      // Iteratively assign the breadth (x-position) for each node.
      // Nodes are assigned the maximum breadth of incoming neighbors plus one;
      // nodes with no incoming links are assigned breadth zero, while
      // nodes with no outgoing links are assigned the maximum breadth.
      function computeNodeBreadths(width, height) {
        var remainingNodes = nodes,
            nextNodes,
            x = 0;

        while (remainingNodes.length) {
          nextNodes = [];
          remainingNodes.forEach(function(node) {
            node.x = x;
            node.dx = nodeWidth;
            node.sourceLinks.forEach(function(link) {
              nextNodes.push(link.target);
            });
          });
          remainingNodes = nextNodes;
          ++x;
        }

        //
        moveSinksRight(x);
        scaleNodeBreadths((width - nodeWidth) / (x - 1));
      }

      function moveSourcesRight() {
        nodes.forEach(function(node) {
          if (!node.targetLinks.length) {
            node.x = d3.min(node.sourceLinks, function(d) { return d.target.x; }) - 1;
          }
        });
      }

      function moveSinksRight(x) {
        nodes.forEach(function(node) {
          if (!node.sourceLinks.length) {
            node.x = x - 1;
          }
        });
      }

      function scaleNodeBreadths(kx) {
        nodes.forEach(function(node) {
          node.x *= kx;
        });
      }

      function computeNodeDepths(iterations) {
        var nodesByBreadth = d3.nest()
            .key(function(d) { return d.x; })
            .sortKeys(d3.ascending)
            .entries(nodes)
            .map(function(d) { return d.values; });

        //
        initializeNodeDepth();
        resolveCollisions();
        for (var alpha = 1; iterations > 0; --iterations) {
          relaxRightToLeft(alpha *= .99);
          resolveCollisions();
          relaxLeftToRight(alpha);
          resolveCollisions();
        }

        function initializeNodeDepth() {
          var ky = d3.min(nodesByBreadth, function(nodes) {
            return (size[1] - (nodes.length - 1) * nodePadding) / d3.sum(nodes, value);
          });

          nodesByBreadth.forEach(function(nodes) {
            nodes.forEach(function(node, i) {
              node.y = i;
              node.dy = node.value * ky;
            });
          });

          links.forEach(function(link) {
            link.dy = link.value * ky;
          });
        }

        function relaxLeftToRight(alpha) {
          nodesByBreadth.forEach(function(nodes, breadth) {
            nodes.forEach(function(node) {
              if (node.targetLinks.length) {
                var y = d3.sum(node.targetLinks, weightedSource) / d3.sum(node.targetLinks, value);
                node.y += (y - center(node)) * alpha;
              }
            });
          });

          function weightedSource(link) {
            return center(link.source) * link.value;
          }
        }

        function relaxRightToLeft(alpha) {
          nodesByBreadth.slice().reverse().forEach(function(nodes) {
            nodes.forEach(function(node) {
              if (node.sourceLinks.length) {
                var y = d3.sum(node.sourceLinks, weightedTarget) / d3.sum(node.sourceLinks, value);
                node.y += (y - center(node)) * alpha;
              }
            });
          });

          function weightedTarget(link) {
            return center(link.target) * link.value;
          }
        }

        function resolveCollisions() {
          nodesByBreadth.forEach(function(nodes) {
            var node,
                dy,
                y0 = 0,
                n = nodes.length,
                i;

            // Push any overlapping nodes down.
            nodes.sort(ascendingDepth);
            for (i = 0; i < n; ++i) {
              node = nodes[i];
              dy = y0 - node.y;
              if (dy > 0) node.y += dy;
              y0 = node.y + node.dy + nodePadding;
            }

            // If the bottommost node goes outside the bounds, push it back up.
            dy = y0 - nodePadding - size[1];
            if (dy > 0) {
              y0 = node.y -= dy;

              // Push any overlapping nodes back up.
              for (i = n - 2; i >= 0; --i) {
                node = nodes[i];
                dy = node.y + node.dy + nodePadding - y0;
                if (dy > 0) node.y -= dy;
                y0 = node.y;
              }
            }
          });
        }

        function ascendingDepth(a, b) {
          return a.y - b.y;
        }
      }

      function computeLinkDepths() {
        nodes.forEach(function(node) {
          node.sourceLinks.sort(ascendingTargetDepth);
          node.targetLinks.sort(ascendingSourceDepth);
        });
        nodes.forEach(function(node) {
          var sy = 0, ty = 0;
          node.sourceLinks.forEach(function(link) {
            link.sy = sy;
            sy += link.dy;
          });
          node.targetLinks.forEach(function(link) {
            link.ty = ty;
            ty += link.dy;
          });
        });

        function ascendingSourceDepth(a, b) {
          return a.source.y - b.source.y;
        }

        function ascendingTargetDepth(a, b) {
          return a.target.y - b.target.y;
        }
      }

      function center(node) {
        return node.y + node.dy / 2;
      }

      function value(link) {
        return link.value;
      }

      return sankey;
    };

    var marginSize = 16;
    var formatNumber = d3.format(",.0f"),
    format = function(d) { return formatNumber(d) + " "; },
    color = d3.scale.category20();

    var sankey = {}
    var sankeyWidget = (function (_super) {
        __extends(sankeyWidget, _super);
        function sankeyWidget(div, model) {
            _super.call(this, div, model);

            this.nodeColor = 'red';
            this.linkColor = 'blue';
            this.linkHoveredColor = '#88F'
            this.linkAlpha = '0.2';
            this.labelColor = 'black';

            this.svg = d3.select(div).append("svg")
              .attr("width", "100%")
              .style("height", "calc(100% - " + marginSize +"px)")
              .style("margin-top", (marginSize/2) + "px")
              .style("overflow", "visible");

            this.width = div.offsetWidth;
            this.height = div.offsetHeight;
            this.sankey = d3.sankey()
              .nodeWidth(15)
              .nodePadding(10)
              .size([div.offsetWidth | this.width, (div.offsetHeight|this.height)-marginSize]);
            this.path = this.sankey.link();
        }
        sankeyWidget.prototype.getDefinition = function () {
            return {
                "name": "",
                "size":"sensor",
                "def_tooltip":false,
                "variables": [{ "t": "tabledata", "n": "data" },{ "t": "bool", "n": "def_tooltip"},{ "t": "color", "n": "nodeColor" },{ "t": "color", "n": "selectedColor" },{ "t": "color", "n": "linkSelectedColor" },{ "t": "color", "n": "hoveredColor" },
                  { "t": "color", "n": "linkHoveredColor" },{ "t": "color", "n": "labelColor" },{ "t": "color", "n": "linkColor" },{ "t": "number", "n": "linkAlpha","minimum":0, "maximum":1 },
                  { "t": "string", "n": "selectedItem" },{ "t": "string", "n": "currentItem" },{ "t": "string", "n": "currentLinkIndex" },{ "t": "string", "n": "filter" },{ "t": "trigger", "n": "refresh" },{ "t": "string", "n": "currentLinkInfo" }],
                "layout": {
                    "type": "vbox",
                    "children": ["data",
                    "def_tooltip",
                    "labelColor",
                     "nodeColor",
                     {
                      "type": "hbox",
                      "children": ["linkColor","linkAlpha"]
                     },
                      {
                      "type": "hbox",
                      "children": ["selectedColor", "linkSelectedColor"]
                     },
                     {
                      "type": "hbox",
                      "children": ["hoveredColor", "linkHoveredColor"]
                     },
                     "selectedItem",
                     "currentItem",
                     "currentLinkIndex",
                     "currentLinkInfo",
                     "filter",
                     "refresh"
                     ]
                }
            };
        };
        ;
        sankeyWidget.prototype.getPropMap = function () {
            return sankeyWidget._blankPropMap;
        };
        sankeyWidget.prototype.onResize = function () {
          this.width = this.parentDiv.offsetWidth;
          this.height = this.parentDiv.offsetHeight;
          this.sankey.size([this.width, this.height-marginSize]);
          this.buildLinks(this.rows);
        }

        sankeyWidget.prototype.updateSelectedItemVal = function(val) {
          this.selectedItemVal = val;
          this.updateModelValue('selectedItem',this.selectedItemVal);
        }

        sankeyWidget.prototype.handleSelect = function(target, name) {
            if (this.selectedItem && this.selectedItem != target) {
              this.selectedItem.style.fill = this.nodeColor;
            }
            this.selectedItem = target;
            if (this.selectedColor && this.selectedItem) {
              this.selectedItem.style.fill = this.selectedColor;
            }
            
            this.updateSelectedItemVal(name);

            // update link selected Color
            if (this.linkSelectedColor) {
              var this_=this;
              this.sankyLinks.style("stroke", function(d) {
                if (d.target.name == name || d.source.name == name){
                  return this_.linkSelectedColor;
                } else {
                  return this_.linkColor
                }});
            }
          }
        sankeyWidget.prototype.applyFilter = function() {
          if (this.snodedata && this.slinks) {
            var filter = null;
            if (typeof this.nodeFilter == 'string' && this.nodeFilter != '') {
              filter = this.nodeFilter.split(',');
            }
            if (filter == null) {
              for (var i = 0; i < this.snodes.length; ++i) {
                this.snodes[i].style.display = '';
              } 
              for (var i = 0; i < this.slinks.length; ++i) {
                this.slinks[i].style.display = '';
              } 
            } else {
              var expandFilter = filter.slice(0)
              for (var i = 0; i < this.slinks.length; ++i) {
                  var name1 = this.slinkdata[i].source.name;
                  var name2 = this.slinkdata[i].target.name;
                 if (filter.indexOf(name1) > -1 || filter.indexOf(name2) > -1) {
                  this.slinks[i].style.display = '';
                  // expand the filter to any node that's connected to the filtered nodes
                  if (expandFilter.indexOf(name1) < 0) {
                    expandFilter.push(name1);
                  } else if (expandFilter.indexOf(name2) < 0) {
                    expandFilter.push(name2);
                  }
                } else {
                  this.slinks[i].style.display = 'none';
                }
              } 
              for (var i = 0; i < this.snodes.length; ++i) {
                if (expandFilter.indexOf(this.snodedata[i].name) > -1) {
                  this.snodes[i].style.display = '';
                } else {
                  this.snodes[i].style.display = 'none';
                }
                
              } 

            }
          }

        }

        sankeyWidget.prototype.buildLinks = function(rows) {
         if (rows == null){
            rows = [];
          }
          this.rows = rows;
          if (!this.timeout) {
              var widget = this;
              this.timeout = setTimeout(function(){ widget.doBuildLinks()}, 1);
          }
        
        }
        sankeyWidget.prototype.doBuildLinks = function() {
          this.timeout = null;
          var rows = this.rows;

          // build names;
          var nameDict = {};
          var nodes = [];
          var links = [];
          function addName(str, label) {
            if (nameDict.hasOwnProperty(str)){
              return;
            }
            nameDict[str] = nodes.length;
            nodes.push({"name":str, "label":label, "allIn":0, "allOut":0});
          }
          for (var i = 0; i < rows.length; ++i) {
            var source = rows[i][1];
            var target = rows[i][2];
            var value = Number(rows[i][3]);
            if (value >= 0 &&  source != null && typeof target != null) {
              source = source.toString();
              target = target.toString();
              if (source != target) {
                if (rows[i].length > 4) {
                  addName(source, rows[i][4]);
                  addName(target, rows[i][5]);
                } else {
                  addName(source, source);
                  addName(target, target);
                }

                nodes[nameDict[source]]['allOut'] += value;
                nodes[nameDict[target]]['allIn'] += value;
                links.push({"source":nameDict[source],"target":nameDict[target],"value":value,"idx":i});
              }
            }
          }

          for (var i = 0; i < nodes.length; ++i) {
            nodes[i]['total'] = Math.max(nodes[i]['allIn'],nodes[i]['allOut']);
          }

          var svg = this.svg;
          var sankey = this.sankey;
          var path = this.path;
          var parentDiv = this.parentDiv;
          var widget = this;
          svg.selectAll('g').remove();

          var currentItem;

          function handleItemClick(e){
            widget.handleSelect(d3.event.target, e.name);
          }
          function handleItemMouseOver(e){
            if (currentItem && currentItem != d3.event.target) {
              if (currentItem == widget.selectedItem && widget.selectedColor) {
                currentItem.style.fill = widget.selectedColor;
              } else {
                currentItem.style.fill = widget.nodeColor;
              }
            }
            currentItem = d3.event.target;
            if (widget.hoveredColor) {
              currentItem.style.fill = widget.hoveredColor;
            }
            
            widget.updateModelValue('currentItem', e.name);
          }
          function handleItemMouseOut(e){
            if (currentItem) {
              if (currentItem == widget.selectedItem && widget.selectedColor) {
                currentItem.style.fill = widget.selectedColor;
              } else {
                currentItem.style.fill = widget.nodeColor;
              }
            }
            currentItem = null;
            widget.updateModelValue('currentItem', null);
          }
          function handleLinkMouseOver(e){
           widget.updateModelValue('currentLinkIndex', e.idx);
            if (widget.linkHoveredColor) {
              d3.event.target.style.stroke = widget.linkHoveredColor;
              widget.updateModelValue('currentLinkInfo',e._tooltip);
            }
          }
          function handleLinkMouseOut(e){
            widget.updateModelValue('currentLinkIndex', null);
            if (widget.linkSelectedColor && widget.selectedItemVal && (e.source.name == widget.selectedItemVal || e.target.name == widget.selectedItemVal)) {
                  d3.event.target.style.stroke = widget.linkSelectedColor;
            } else {
                  d3.event.target.style.stroke = widget.linkColor;
            }
            widget.updateModelValue('currentLinkInfo',null);
          }
          sankey.nodes(nodes).links(links).layout(32, this.parentDiv.offsetWidth | this.width, (this.parentDiv.offsetHeight|this.height)-marginSize);

          for (var i = 0; i < links.length; ++i) {
            var d = links[i];
            var r1 = (d.value * 100/ d.source['total']).toFixed(1);
            var r2 = (d.value * 100/ d.target['total']).toFixed(1);
            d._tooltip = d.source.label + " " + format(d.value) +  "(" + r1 + "%) → " + d.target.label + " " + format(d.value) + "(" + r2 + "%)";
            console.log("tooltip", widget.def_tooltip)
            if (widget.def_tooltip==true)
              {
                d.tooltip = d._tooltip;
              }
              else
              {
                d.tooltip = null;
              }
          }
          var link = svg.append("g").selectAll(".link")
              .data(links)
            .enter().append("path")
              .attr("class", "link")
              .attr("d", path)
              .style("stroke-width", function(d) { return Math.max(1, d.dy); })
              .style("fill", "none")
              .style("stroke", this.linkColor)
              .style("stroke-opacity", this.linkAlpha)
              .sort(function(a, b) { return b.dy - a.dy; })
              .on("mouseover", handleLinkMouseOver)
              .on("mouseout", handleLinkMouseOut);
          this.sankyLinks = link;

          link.append("title")
              .text(function(d) { 
                return d.tooltip;
              });

          var node = svg.append("g").selectAll(".node")
              .data(nodes)
            .enter().append("g")
              .attr("class", "node")
              .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
            .call(d3.behavior.drag()
              .origin(function(d) { return d; })
              .on("dragstart", function() { this.parentNode.appendChild(this); })
              .on("drag", dragmove))
              .on("mouseover", handleItemMouseOver)
              .on("mouseout", handleItemMouseOut)
              .on("mousedown", handleItemClick).on("touchstart", handleItemClick);

          node.append("rect")
              .attr("height", function(d) { return d.dy; })
              .attr("width", sankey.nodeWidth())
              .style("fill", this.nodeColor)
            .append("title")
              .text(function(d) { return d.label + "\n" + format(d.value); });

          node.append("text")
              .attr("x", -6)
              .attr("y", function(d) { return d.dy / 2; })
              .attr("dy", ".35em")
              .style("text-anchor", "end")
              .attr("transform", null)
              .attr("fill", this.labelColor)
              .text(function(d) { return d.label; })
            .filter(function(d) { return d.x < (parentDiv.offsetWidth|widget.width) / 2; })
              .attr("x", 6 + sankey.nodeWidth())
              .style("text-anchor", "start");
          function dragmove(d) {
            if (d3.event.y != d3.event.y) return;
            d3.select(this).attr("transform", "translate(" + d.x + "," + (d.y = Math.max(0, Math.min((parentDiv.offsetHeight|widget.height)-marginSize - d.dy, d3.event.y))) + ")");
            sankey.relayout();
            link.attr("d", path);
          }
          var snodes = svg.selectAll('.node');
          var slinks = svg.selectAll('.link');
          this.snodedata = snodes.data();
          this.slinkdata = slinks.data();
          this.snodes = snodes[0];
          this.slinks = slinks[0];

          if (widget.nodeFilter) {
            widget.applyFilter();
          }
        }
        sankeyWidget._blankPropMap = {
            "data": function (widget, value) {
                widget.updateModelValue('currentLinkIndex', null);
                widget.updateModelValue('currentItem', null);
                widget.updateSelectedItemVal(null);
                widget.buildLinks(dgluxjs.getTableRows(value));
            },
            "def_tooltip": function(widget, value) {
                widget.def_tooltip = value == true;
                console.log ("def_toolip", widget.def_tooltip)
                widget.buildLinks(widget.rows);
            },
            "nodeColor" : function (widget, value) {
              if (typeof value == 'string') {
                widget.nodeColor = value;
              } else if (typeof value == 'number') {
                widget.nodeColor = "#" + (0x1000000 + value).toString(16).slice(1);
              }
              
                widget.buildLinks(widget.rows);
            },
            "hoveredColor" : function (widget, value) {
              if (typeof value == 'string') {
                widget.hoveredColor = value;
              } else if (typeof value == 'number') {
                widget.hoveredColor = "#" + (0x1000000 + value).toString(16).slice(1);
              }
              
                widget.buildLinks(widget.rows);
            },
            "selectedColor" : function (widget, value) {
              if (typeof value == 'string') {
                widget.selectedColor = value;
              } else if (typeof value == 'number') {
                widget.selectedColor = "#" + (0x1000000 + value).toString(16).slice(1);
              }
              
                widget.buildLinks(widget.rows);
            },
            "linkSelectedColor" : function (widget, value) {
              if (typeof value == 'string') {
                widget.linkSelectedColor = value;
              } else if (typeof value == 'number') {
                widget.linkSelectedColor = "#" + (0x1000000 + value).toString(16).slice(1);
              }
              
                widget.buildLinks(widget.rows);
            },
            "labelColor" : function (widget, value) {
              if (typeof value == 'string') {
                widget.labelColor = value;
              } else if (typeof value == 'number') {
                widget.labelColor = "#" + (0x1000000 + value).toString(16).slice(1);
              }
              
                widget.buildLinks(widget.rows);
            },
            "linkColor" : function (widget, value) {
              if (typeof value == 'string') {
                widget.linkColor = value;
              } else if (typeof value == 'number') {
                widget.linkColor = "#" + (0x1000000 + value).toString(16).slice(1);
              }
                widget.buildLinks(widget.rows);
            },
            "linkHoveredColor": function (widget, value) {
              if (typeof value == 'string') {
                widget.linkHoveredColor = value;
              } else if (typeof value == 'number') {
                widget.linkHoveredColor = "#" + (0x1000000 + value).toString(16).slice(1);
              }
                widget.buildLinks(widget.rows);
            },
            "linkAlpha" : function (widget, value) {
              if (typeof value == 'number') {
                widget.linkAlpha = value.toString();
              }
                widget.buildLinks(widget.rows);
            },
            'selectedItem' :function (widget, value) {
              if (value != widget.selectedItemVal) {
                for (var i = 0; i < widget.snodedata.length; ++i) {
                    if (widget.snodedata[i].name == value) {
                      break;
                    }
                }
                if (i < widget.snodedata.length) {
                    widget.handleSelect(widget.snodes[i].childNodes[0], value);
                } else {
                  widget.handleSelect(null, value);
                }
              }
            },
            'filter' :function (widget, value) {
              if (value != widget.nodeFilter) {
                widget.nodeFilter = value;
                widget.applyFilter();
              }
            },
            'refresh' :function (widget, value) {
              if (value != null) {
               widget.buildLinks(widget.rows);
              }
            },
        };
        return sankeyWidget;
    }(dgluxjs.Widget));
    sankey.sankeyWidget = sankeyWidget;
    function create(div, model) {
        return new sankeyWidget(div, model);
    }
    sankey.dgNewWidget = create;

    return sankey;

});
