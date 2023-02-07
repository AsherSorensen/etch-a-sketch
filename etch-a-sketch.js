export default class EtchASketch {
  STEP_SIZE_DEFAULT = 10
  CHANGE_IN_OPACITY_DEFAULT = 20
  BATCH_TIME_DEFAULT = 5

  HEIGHT_DEFAULT = 500
  WIDTH_DEFAULT = 800

  constructor({ x, y, stepSize, changeInOpacity, batchTime, width, height, action, actionId } = {}) {
    this.lines = []
    this.moves = []
    this.canvas = new Canvas()
    this.view = new SketchView({ 
      right: this.increaseLeft.bind(this), 
      left: this.decreaseLeft.bind(this), 
      up: this.decreaseRight.bind(this), 
      down: this.increaseRight.bind(this),
      shake: this.shake.bind(this),
      canvasWidth: width || this.WIDTH_DEFAULT,
      canvasHeight: height || this.HEIGHT_DEFAULT
    })

    this.cursor = { 
      x: x || randomInteger(width || this.WIDTH_DEFAULT),
      y: y || randomInteger(height || this.HEIGHT_DEFAULT) 
    }

    this.stepSize = stepSize || this.STEP_SIZE_DEFAULT
    this.batchTime = batchTime || this.BATCH_TIME_DEFAULT
    this.changeInOpacity = changeInOpacity || this.CHANGE_IN_OPACITY_DEFAULT
    this.action = action
    this.actionId = actionId || 'export'
    this.lastRunTime = null
  }

  set lineWidth(width) {
    this.canvas.lineWidth = width
    this._draw()
  }

  build() {
    this.view.build()

    if (this.action) {
      const onAction = () => {
        this.lineWidth = 5
        this.action()
      }

      const exportButton = document.getElementById(this.actionId)
      exportButton.addEventListener('touchstart', onAction)
      exportButton.addEventListener('click', onAction)
    }
  }

  shake() {
    const newLines = this.lines.map(line => {
      line.opacity -= this.changeInOpacity
      return line
    })

    this.lines = newLines.filter(line => line.opacity > 0)
    this._draw()
  }

  clear() {
    this.lines = []
    this.canvas.clear()
  }
  
  increaseLeft() {
    this._processInput(this.stepSize, 0)
  }

  decreaseLeft() {
    this._processInput(-1 * this.stepSize, 0)
  }

  increaseRight() {
    this._processInput(0, this.stepSize)
  }

  decreaseRight() {
    this._processInput(0, -1 * this.stepSize)
  }

  _draw() {
    this.canvas.draw(this.lines, this.cursor.x, this.cursor.y)
  }

  _processInput(x, y) {
    this.moves.push([x, y])

    if(this.lastRunTime === null || Date.now() - this.lastRunTime > this.batchTime) {
      this._handleMoves()
    }
  }

  _handleMoves() {
    this.lastRunTime = Date.now()
    const sum = [0, 0]

    this.moves.forEach(m => {
      sum[0] += m[0]
      sum[1] += m[1]
    })

    this.moves = []

    this._addToCursor(sum[0], sum[1])
  }

  _addToCursor(x, y) {
    const { height, width } = this.canvas.size

    const newCursor = { 
      x: clamp(this.cursor.x + x, 0, width),
      y: clamp(this.cursor.y + y, 0, height) 
    }

    this.lines.push(Line.fromPoints(this.cursor, newCursor))
    this.cursor = newCursor
    this._draw()
  }
}

class SketchView {
  static HEIGHT_TO_WIDTH_RATIO = (3.25 / 3.75)
  static HEIGHT_TO_KNOB_RATIO = (1 / 6)
  static HEIGHT_TO_BORDER_RATIO = (1 / 7)
  static SHAKE_DISTANCE = 50
  static SHAKE_ANGLE = 20
  static FINGER_GUIDE_RATIO = 2

  constructor({ height, width, canvasHeight, canvasWidth, containerId, left, right, up, down, shake, action } = {}) {
    this.height = height || screen.height * .6
    this.width = width || screen.width * .9
    this.canvasHeight = canvasHeight
    this.canvasWidth = canvasWidth
    this.containerId = containerId || 'container'
    this.moveLocks = new Set()

    this.left = left || (() => {})
    this.right = right || (() => {})
    this.up = up || (() => {})
    this.down = down || (() => {})
    this.shake = shake || (() => {})
    this.action = action || (() => {})
  }

  get proportions() {
    if (!this._proportions) this._proportions = this.getProportions()

    return this._proportions
  }

  get moveControls() {
    if (!this._moveControls) {
      this._moveControls = {
        addLock: (lock) => this.moveLocks.add(lock),
        removeLock: (lock) => this.moveLocks.delete(lock),
        canShake: () => this.moveLocks.size === 0
      }
    }

    return this._moveControls
  }

  getProportions(viewHeight = this.height, viewWidth = this.width) {
    const heightRestricted = viewHeight / viewWidth < SketchView.HEIGHT_TO_WIDTH_RATIO
    let maxHeight, maxWidth

    if (heightRestricted) {
      maxHeight = viewHeight
      maxWidth = viewHeight / SketchView.HEIGHT_TO_WIDTH_RATIO
    } else {
      maxWidth = viewWidth
      maxHeight = viewWidth * SketchView.HEIGHT_TO_WIDTH_RATIO
    }

    const knob = maxHeight * SketchView.HEIGHT_TO_KNOB_RATIO
    const border = maxHeight * SketchView.HEIGHT_TO_BORDER_RATIO

    return {
      height: maxHeight,
      width: maxWidth,
      border,
      knob
    }
  }

  build({ id = 'container', leftControlId = 'l_picker', rightControlId = 'r_picker', allowHotkeys = true } = {}) {
    if (allowHotkeys) this._setupHotkeys()

    SketchView.createView({ canvasWidth: this.canvasWidth, canvasHeight: this.canvasHeight })

    const container = document.getElementById(id)
    container.style['border-width'] = this.proportions.border + 'px ' + this.proportions.border + 'px ' + (1.2 * this.proportions.border) + 'px ' + this.proportions.border + 'px '
    container.style['height'] = this.proportions.height + 'px'
    container.style['width'] = this.proportions.width + 'px'

    this._setupKnob(leftControlId, this.right, this.left)
    this._setupKnob(rightControlId, this.up, this.down)
    this._setupBoard(id, leftControlId, rightControlId)
  }

  _setupBoard(id, left, right) {
    const board = document.getElementById(id)
    const leftControl = document.getElementById(left)
    const rightControl = document.getElementById(right)
    let start = null
    let shakePosition = null
    let shakeAngle = null

    const down = (event) => {
      if(!this.moveControls.canShake()) return
      if(isEventInElement(event, leftControl) || isEventInElement(event, rightControl)) return

      event.preventDefault()
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
      document.addEventListener('touchmove', move)
      document.addEventListener('touchend', up)

      const canvasX = pxToInt(board.style['left'])
      const canvasY = pxToInt(board.style['top'])

      const coordinates = getCoordinates(event)
      if (coordinates.x === null || coordinates.y === null) return
      start = { x: coordinates.x - canvasX, y: coordinates.y - canvasY }
    }

    const move = (event) => {
      const center = centerOf(board)
      const coordinates = getCoordinates(event)
      if (coordinates.x === null || coordinates.y === null) return
      if (!shakePosition) shakePosition = getCoordinates(event)
      if (!shakeAngle) shakeAngle = getAngle(coordinates, center)
      
      const angle = getAngle(coordinates, center)
      const diff = { x: start.x - coordinates.x || 0, y: start.y - coordinates.y || 0 }
      const distance = Math.hypot(coordinates.x-shakePosition.x, coordinates.y-shakePosition.y)

      if(distance > SketchView.SHAKE_DISTANCE && Math.abs(shakeAngle - angle) > SketchView.SHAKE_ANGLE) {
        this.shake()
        shakePosition = coordinates
        shakeAngle = angle
      }

      board.style['cursor'] = 'grabbing'
      board.style['top'] = -diff.y + 'px'
      board.style['left'] = -diff.x + 'px'
    }

    const up = (_event) => {
      document.removeEventListener('mouseup', up)
      document.removeEventListener('mousemove', move)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', up)

      board.style['cursor'] = 'grab'

      start = null
      shakePosition = null
    }

    board.addEventListener('mousedown', down)
    board.addEventListener('touchstart', down)
  }

  _setupKnob(pickerId, increase, decrease, includeTouchHelper = true) {
    const picker = document.getElementById(pickerId)
    let startingAngle = 0
    let trackingAngle = 0
    let identifier = null

    const transform = getTransformation()

    const handleMove = (nextAngle, trackingAngle) => {
      if (Math.abs(nextAngle - trackingAngle) < 10) return

      if (nextAngle > trackingAngle) increase()
      if (nextAngle < trackingAngle) decrease()
    }

    const mousedown = (event) => {
      event.preventDefault()
      const center = centerOf(picker)
      document.addEventListener('mousemove', mousemove)
      document.addEventListener('mouseup', mouseup)

      this.moveControls.addLock(pickerId)

      const coordinates = getCoordinates(event, identifier)
      startingAngle = getAngle(coordinates, center)
      trackingAngle = startingAngle
    }

    const mousemove = (event) => {
      const center = centerOf(picker)
      const coordinates = getCoordinates(event, identifier)
      const nextAngle = getAngle(coordinates, center) - startingAngle

      picker.style[transform] = 'rotate(' + nextAngle + 'deg)'
      picker.style['cursor'] = 'grabbing'

      handleMove(nextAngle, trackingAngle)
      trackingAngle = nextAngle
    }

    const mouseup = () => {
      document.removeEventListener('mouseup', mouseup)
      document.removeEventListener('mousemove', mousemove)
      picker.style['cursor'] = 'grab'

      this.moveControls.removeLock(pickerId)
      identifier = null
    }

    const touchDown = (event) => {
      event.preventDefault()
      const center = centerOf(picker)
      document.addEventListener('touchmove', touchMove)
      document.addEventListener('touchend', touchUp)

      this.moveControls.addLock(pickerId)

      identifier = event.changedTouches[0].identifier

      const coordinates = getCoordinates(event, identifier)
      startingAngle = getAngle(coordinates, center)
      trackingAngle = startingAngle
    }

    const touchMove = (event) => {
      const touches = touchesForIdentifier(event, identifier)
      const pickerTouches = touchesForElementId(event, pickerId)
      const grabberTouches = touchesForElementId(event, pickerId+'_grabber')
      if (identifier && touches.length === 0) return
      if (identifier && grabberTouches.length === 0 && pickerTouches.length === 0) return
      const center = centerOf(picker)

      const coordinates = getCoordinates(event, identifier)
      const nextAngle = getAngle(coordinates, center) - startingAngle
      picker.style[transform] = 'rotate(' + nextAngle + 'deg)'

      handleMove(nextAngle, trackingAngle)
      trackingAngle = nextAngle
    }

    const touchUp = () => {
      document.removeEventListener('touchmove', touchMove)
      document.removeEventListener('touchend', touchUp)

      this.moveControls.removeLock(pickerId)
      identifier = null
    }

    picker.style['height'] = this.proportions.knob + 'px'
    picker.style['width'] = this.proportions.knob + 'px'
    picker.addEventListener('mousedown', mousedown)
    picker.addEventListener('touchstart', touchDown)

    const touchGuard = (callback) => {
      return (event) => {
        if(isEventInElement(event, pickerId)) return
        callback(event)
      }
    }

    if (includeTouchHelper) {
      const fingerGuide = document.createElement('div')
      fingerGuide.style['height'] = (SketchView.FINGER_GUIDE_RATIO * this.proportions.knob) + 'px'
      fingerGuide.style['width'] = (SketchView.FINGER_GUIDE_RATIO * this.proportions.knob) + 'px'
      fingerGuide.style['borderRadius'] = '50%'
      fingerGuide.style['backgroundColor'] = 'rgba(0, 0, 0, .3)'
      fingerGuide.id = pickerId + '_grabber'
      picker.appendChild(fingerGuide)
  
      fingerGuide.addEventListener('mousedown', touchGuard(mousedown))
      fingerGuide.addEventListener('touchstart', touchGuard(touchDown))
    }
  }

  _setupHotkeys() {
    document.addEventListener('keydown', (event) => {
      this.moveControls.addLock('key')
      if (['d', 'D', 'ArrowRight'].includes(event.key)) this.right()
      if (['a', 'A', 'ArrowLeft'].includes(event.key)) this.left()

      if (['w', 'W', 'ArrowUp'].includes(event.key)) this.up()
      if (['s', 'S', 'ArrowDown'].includes(event.key)) this.down()
    })

    document.addEventListener('keyup', () => {
      this.moveControls.removeLock('key')
    })
  }

  static createPicker(id) {
    const element = document.createElement('div')
    element.id = id
    element.style.borderRadius = '50%'
    element.style.width = '100px'
    element.style.height = '100px'
    element.style.backgroundColor = 'rgb(234,237,242)'
    element.style.backgroundColor = 'radial-gradient(circle, rgba(234,237,242,1) 0%, rgba 87%, rgba(255,255,255,1) 100%)'
    element.style.border = 'dashed white .5rem'
    element.style.boxShadow = '2px 2px 6px 0px rgba(0, 0, 0, 0.5)'

    return element
  }

  static createView({ canvasHeight, canvasWidth, id = 'container', buttonText = 'Sign'} = {}) {
    const container = document.getElementById(id)
    container.style.borderStyle = 'outset'
    container.style.borderColor ='#c81b13'
    container.style.backgroundColor = '#c81b13'
    container.style.borderRadius = '3.5rem'
    container.style.width = 'max-content'
    container.style.position = 'fixed'
    container.style.cursor = 'grab'
    container.style.boxShadow = '2px 2px 6px 0px rgba(0, 0, 0, 0.5)'
    container.style.top = '0'
    container.style.left = '0'

    const canvas = document.createElement('canvas')
    canvas.id = 'canvas'
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    canvas.style.borderRadius = '1.5rem'
    canvas.style.boxShadow = 'inset 2px 2px 6px 0px rgba(0, 0, 0, 0.5)'
    canvas.style.width = '100%'
    canvas.style.width = '-moz-available'
    canvas.style.width = '-webkit-fill-available'
    canvas.style.width = 'fill-available'
    canvas.style.height = '100%'
    canvas.style.height = '-moz-available'
    canvas.style.height = '-webkit-fill-available'
    canvas.style.height = 'fill-available'
    canvas.style.background = 'rgb(163,151,158)'
    canvas.style.background = 'radial-gradient(circle, rgba(163,151,158,1) 0%, rgba(160,148,155,1) 51%, rgba(166,161,165,1) 100%)'

    const controls = document.createElement('span')
    controls.style.display = 'flex'
    controls.style.justifyContent = 'space-between'
    controls.style.alignItems = 'center'

    const actionButton = document.createElement('button')
    actionButton.id = 'export'
    actionButton.style.width = '20%'
    actionButton.innerText = buttonText

    controls.appendChild(SketchView.createPicker('l_picker'))
    controls.appendChild(actionButton)
    controls.appendChild(SketchView.createPicker('r_picker'))

    container.appendChild(canvas)
    container.appendChild(controls)
  }
}

class Line {
  constructor({ x1, y1, x2, y2, strokeStyle, opacity } = {}) {
    this.x1 = x1 || 0
    this.y1 = y1 || 0
    this.x2 = x2 || 0
    this.y2 = y2 || 0
    this.strokeStyle = strokeStyle || '#000'
    this.opacity = opacity || 100
  }

  static fromPoints(p1, p2) {
    return new Line({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
  }

  draw(ctx) {
    const oldAlpha = ctx.globalAlpha
    ctx.globalAlpha = this.opacity / 100

    ctx.beginPath()
    ctx.moveTo(this.x1, this.y1)
    ctx.lineTo(this.x2, this.y2)

    ctx.strokeStyle = this.strokeStyle
    ctx.stroke()
    
    ctx.globalAlpha = oldAlpha
  }
}

class Canvas {
  CURSOR_COLOR_DEFAULT = '#b2a6af'
  LINE_WIDTH_DEFAULT = 2
  CANVAS_ID_DEFAULT = 'canvas'

  constructor({ id, lineWidth, cursorColor } = {}) {
    this.id = id || this.CANVAS_ID_DEFAULT
    this._lineWidth = lineWidth || this.LINE_WIDTH_DEFAULT
    this.cursorColor = cursorColor || this.CURSOR_COLOR_DEFAULT
  }

  get canvas() {
    if (!this._canvas) this._canvas = document.getElementById(this.id)
    return this._canvas
  }

  get ctx() {
    return this.canvas.getContext('2d')
  }

  get lineWidth() {
    return this._lineWidth
  }

  set lineWidth(width) {
    this._lineWidth = width
  }

  get size() {
    return {
      height: this.canvas.height,
      width: this.canvas.width
    }
  }

  draw(lines, x, y) {
    this.clear()

    if (lines.length === 0) return

    this._drawLines(lines)
    this._drawCursor(x, y)
  }

  _drawCursor(x, y) {
    const x1 = x - this.lineWidth
    const y1 = y - this.lineWidth
    this.ctx.fillStyle = this.cursorColor

    this.ctx.fillRect(x1, y1, 2 * this.lineWidth, 2 * this.lineWidth)
  }

  _drawLines(lines) {
    this.ctx.lineWidth = this.lineWidth

    lines.forEach(line => line.draw(this.ctx))
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }
}
const touchesForIdentifier = (event, identifier) => {
  if (!event || !event.changedTouches) return []
  const touches = []

  Object.values(event.changedTouches).forEach(touch => {
    if (touch.identifier === identifier) {
      touches.push(touch)
    }
  })

  return touches
}

const touchesForElementId = (event, elementId) => {
  if (!event || !event.changedTouches) return []
  const touches = []
  
  Object.values(event.changedTouches).forEach(touch => {
    if (touch.target.id === elementId) {
      touches.push(touch)
    }
  })

  return touches
}

const pxToInt = (px) => {
  if (px.length < 3) return 0
  if (px.slice(-2) !== 'px') return 0

  const substring = px.slice(0, -2)
  return Number(substring) || 0
}

const isEventInElement = (event, element) => {
  if (!event || !element) return false
  if (typeof element === 'string') element = document.getElementById(element)
  const coordinates = getCoordinates(event)
  const rect = element.getBoundingClientRect()
  const x = coordinates.x
  if (x < rect.left || x >= rect.right) return false
  const y = coordinates.y
  if (y < rect.top || y >= rect.bottom) return false;
  return true
}

const getCoordinates = (event, identifier = null) => {
  if (event.pageX) {
    return { 
      x: event.pageX, 
      y: event.pageY
    }
  }

  if (identifier) {
    for (let i = 0; i < event.touches.length; i++) {
      const touch = event.touches[i]

      if (touch.identifier === identifier) {
        return { 
          x: touch.pageX,
          y: touch.pageY
        }
      }
    }
  } else {
    if (event.touches && event.touches.length > 0) {
      return { 
        x: event.touches[0].pageX,
        y: event.touches[0].pageY
      }
    }
  }

  return { 
    x: null,
    y: null
  }
}

function getTransformation() {
  const prefs = ['t', 'WebkitT', 'MozT', 'msT', 'OT']
  const style = document.documentElement.style
  let p
  for (var i = 0, len = prefs.length; i < len; i++) {
    if ((p = prefs[i] + 'ransform') in style) return p
  }

  alert('your browser doesnot support css transforms!')
}

function randomInteger(max, min = 0) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function clamp(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}

function centerOf(element) {
  const rect = element.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }
}

function getAngle(p1, p2) {
  const deltaX = p2.x-p1.x
  const deltaY = p2.y-p1.y
  const angle = (Math.atan2(deltaY, deltaX) - Math.PI/4) * (180 / Math.PI)
  return angle
}
